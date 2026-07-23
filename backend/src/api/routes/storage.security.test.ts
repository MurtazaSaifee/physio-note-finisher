import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createInMemoryAuthRepository,
  hashUserPassword,
  registerAuthRoutes,
} from "./auth.js";
import { registerStorageRoutes } from "./storage.js";
import { getLocalStoragePath } from "../../infrastructure/storage/localStorageProvider.js";

let storageRoot = "";

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
  });

  const app = Fastify();
  app.decorate("authRepository", repository);
  registerAuthRoutes(app, repository);
  registerStorageRoutes(app);
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "clinician@example.com",
      password: "password123",
    },
  });
  const { accessToken } = login.json() as { accessToken: string };
  return { app, accessToken };
}

describe("local storage download security", () => {
  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "physio-storage-"));
    configureTestEnvironment();
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
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

  it("rejects traversal outside the configured storage root", () => {
    expect(() => getLocalStoragePath("../package.json")).toThrow(
      "Invalid storage key",
    );
    expect(() => getLocalStoragePath("clinics/clinic-1/export.pdf")).not.toThrow();
  });

  it("allows an authenticated clinic to download its own file", async () => {
    const { app, accessToken } = await createFixture();
    const key = "clinics/clinic-1/exports/note.pdf";
    const filePath = path.join(storageRoot, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "safe-pdf");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/storage/download/${encodeURIComponent(key)}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("safe-pdf");
    await app.close();
  });

  it("forbids an authenticated clinic from reading another clinic's file", async () => {
    const { app, accessToken } = await createFixture();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/storage/download/${encodeURIComponent(
        "clinics/clinic-2/exports/note.pdf",
      )}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
