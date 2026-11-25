import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createInMemoryAuthRepository,
  hashUserPassword,
  registerAuthRoutes,
} from "../../src/api/routes/auth.js";
import { registerStorageRoutes } from "../../src/api/routes/storage.js";
import {
  createPresignedDownloadUrl,
  getLocalStoragePath,
  normalizeStorageKey,
  resetS3Client,
} from "../../src/infrastructure/s3/s3Client.js";

let storageRoot = "";
const savedEnv = { ...process.env };

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    APP_ENV: "local",
    NODE_ENV: "test",
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    ACCESS_TOKEN_TTL_SECONDS: "900",
    REFRESH_TOKEN_TTL_SECONDS: "604800",
    BCRYPT_COST_FACTOR: "8",
    AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "100",
    AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "100",
    LOCAL_STORAGE_DIR: storageRoot,
  });
  delete process.env.S3_BUCKET;
  delete process.env.S3_REGION;
  resetS3Client();
}

async function createFixture() {
  const repository = createInMemoryAuthRepository();
  await repository.createUser({
    id: "user-1",
    clinicId: "clinic-1",
    email: "clinician@example.com",
    name: "Demo Clinician",
    passwordHash: await hashUserPassword("password123"),
    tokenVersion: 0,
    emailVerified: true,
  } as Parameters<typeof repository.createUser>[0]);

  const app = Fastify();
  app.decorate("authRepository", repository);
  registerAuthRoutes(app, repository);
  registerStorageRoutes(app);
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "clinician@example.com", password: "password123" },
  });
  expect(login.statusCode).toBe(200);
  const { accessToken } = login.json() as { accessToken: string };
  return { app, accessToken };
}

async function writeStoredFile(key: string, body: string): Promise<void> {
  const filePath = path.join(storageRoot, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
}

describe("local storage download security", () => {
  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "physio-storage-"));
    configureTestEnvironment();
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
    process.env = { ...savedEnv };
    resetS3Client();
  });

  it("normalises keys and rejects anything that climbs out of the root", () => {
    expect(normalizeStorageKey("clinics/clinic-1/exports/note.pdf")).toBe(
      "clinics/clinic-1/exports/note.pdf",
    );
    expect(normalizeStorageKey("clinics/clinic-1/../clinic-2/note.pdf")).toBe(
      "clinics/clinic-2/note.pdf",
    );
    expect(normalizeStorageKey("../package.json")).toBeNull();
    expect(normalizeStorageKey("/etc/passwd")).toBeNull();
    expect(normalizeStorageKey("clinics\\clinic-1\\note.pdf")).toBeNull();
  });

  it("never resolves a path outside the configured storage root", () => {
    expect(() => getLocalStoragePath("../package.json")).toThrow("Invalid storage key");
    expect(() => getLocalStoragePath("clinics/../../secrets")).toThrow("Invalid storage key");
    expect(getLocalStoragePath("clinics/clinic-1/export.pdf")).toBe(
      path.join(path.resolve(storageRoot), "clinics/clinic-1/export.pdf"),
    );
  });

  it("hands out an API download URL instead of a device-unreachable file:// path", async () => {
    await expect(
      createPresignedDownloadUrl("clinics/clinic-1/exports/note.pdf"),
    ).resolves.toBe(
      `/api/v1/storage/download/${encodeURIComponent("clinics/clinic-1/exports/note.pdf")}`,
    );
  });

  it("requires authentication for downloads", async () => {
    const { app } = await createFixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/storage/download/clinics%2Fclinic-1%2Fexports%2Fnote.pdf",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("allows an authenticated clinic to download its own file", async () => {
    const { app, accessToken } = await createFixture();
    const key = "clinics/clinic-1/exports/note.pdf";
    await writeStoredFile(key, "safe-pdf");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/storage/download/${encodeURIComponent(key)}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.body).toBe("safe-pdf");
    await app.close();
  });

  it("forbids reading another clinic's file", async () => {
    const { app, accessToken } = await createFixture();
    await writeStoredFile("clinics/clinic-2/exports/note.pdf", "other-clinic");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/storage/download/${encodeURIComponent("clinics/clinic-2/exports/note.pdf")}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it.each([
    encodeURIComponent("clinics/clinic-1/../clinic-2/exports/note.pdf"),
    "clinics/clinic-1/%2E%2E/clinic-2/exports/note.pdf",
    "clinics%2Fclinic-1%2F..%2Fclinic-2%2Fexports%2Fnote.pdf",
  ])("blocks dot-dot traversal into another clinic (%s)", async (encodedKey) => {
    const { app, accessToken } = await createFixture();
    await writeStoredFile("clinics/clinic-2/exports/note.pdf", "other-clinic");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/storage/download/${encodedKey}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect([400, 403]).toContain(response.statusCode);
    expect(response.body).not.toContain("other-clinic");
    await app.close();
  });
});
