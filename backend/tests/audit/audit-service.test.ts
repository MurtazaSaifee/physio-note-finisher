import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import { prisma } from "../../src/data/prismaClient.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

beforeEach(() => {
  setAuthEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("auditService", () => {
  it("createAuditEvent persists an event with correct fields", async () => {
    const auditService = await import("../../src/domain/audit/auditService.js");
    const createSpy = vi
      .spyOn(prisma.auditEvent, "create")
      .mockResolvedValue({
        id: "audit-1",
        eventType: "noteCreated",
        sessionId: "session-1",
        userId: "user-1",
        clinicId: "clinic-1",
        timestamp: new Date("2026-04-30T10:00:00.000Z"),
        metadata: null,
      } as never);

    await auditService.createAuditEvent({
      eventType: "noteCreated",
      sessionId: "session-1",
      userId: "user-1",
      clinicId: "clinic-1",
      metadata: null,
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "noteCreated",
          sessionId: "session-1",
          userId: "user-1",
          clinicId: "clinic-1",
          metadata: expect.anything(),
        }),
      }),
    );
  });

  it("getAuditHistoryForSession returns events in chronological order", async () => {
    const auditService = await import("../../src/domain/audit/auditService.js");
    const findManySpy = vi
      .spyOn(prisma.auditEvent, "findMany")
      .mockResolvedValue([
        {
          id: "audit-1",
          eventType: "noteCreated",
          sessionId: "session-1",
          userId: "user-1",
          clinicId: "clinic-1",
          timestamp: new Date("2026-04-30T09:00:00.000Z"),
          metadata: null,
          user: { firstName: "Alice", lastName: "Smith" },
        },
        {
          id: "audit-2",
          eventType: "sectionEdited",
          sessionId: "session-1",
          userId: "user-1",
          clinicId: "clinic-1",
          timestamp: new Date("2026-04-30T10:00:00.000Z"),
          metadata: { sectionName: "objective" },
          user: { firstName: "Alice", lastName: "Smith" },
        },
      ] as never);

    const result = await auditService.getAuditHistoryForSession({
      sessionId: "session-1",
      clinicId: "clinic-1",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId: "session-1",
          clinicId: "clinic-1",
        },
        orderBy: {
          timestamp: "asc",
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    );
    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventType).toBe("noteCreated");
    expect(result.events[1].eventType).toBe("sectionEdited");
  });

  it("getAuditHistoryForSession returns empty array for wrong clinic", async () => {
    const auditService = await import("../../src/domain/audit/auditService.js");
    vi.spyOn(prisma.auditEvent, "findMany").mockResolvedValue([] as never);

    const result = await auditService.getAuditHistoryForSession({
      sessionId: "session-1",
      clinicId: "wrong-clinic",
    });

    expect(result.events).toEqual([]);
  });
});

describe("auditRoutes", () => {
  async function buildApp(): Promise<FastifyInstance> {
    const { registerAuditRoutes } = await import(
      "../../src/api/routes/audit.js"
    );
    const app = Fastify();
    registerAuditRoutes(app);
    await app.ready();
    return app;
  }

  it("returns 401 without auth", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit/sessions/session-1",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for wrong clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit/sessions/session-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-2",
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns 200 with correct events for authorized clinic", async () => {
    vi.spyOn(prisma.auditEvent, "findMany").mockResolvedValue([
      {
        id: "audit-1",
        eventType: "noteCreated",
        sessionId: "session-1",
        userId: "user-1",
        clinicId: "clinic-1",
        timestamp: new Date("2026-04-30T09:00:00.000Z"),
        metadata: null,
        user: { firstName: "Alice", lastName: "Smith" },
      },
    ] as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit/sessions/session-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.sessionId).toBe("session-1");
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].eventType).toBe("noteCreated");
    expect(json.data.events[0].user?.firstName).toBe("Alice");
  });

  it("returns empty array when no events found", async () => {
    vi.spyOn(prisma.auditEvent, "findMany").mockResolvedValue([] as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit/sessions/session-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.data.events).toEqual([]);
  });
});

describe("auditContracts", () => {
  it("validates section metadata for sectionEdited event", async () => {
    const contracts = await import("../../../shared/contracts/audit.js");
    const parsed = contracts.sectionEditMetadataSchema.safeParse({
      sectionName: "objective",
    });
    expect(parsed.success).toBe(true);
  });

  it("validates export metadata for noteExported event", async () => {
    const contracts = await import("../../../shared/contracts/audit.js");
    const parsed = contracts.exportMetadataSchema.safeParse({
      exportAction: "saved",
      exportType: "fullNote",
      format: "pdf",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid section name in metadata", async () => {
    const contracts = await import("../../../shared/contracts/audit.js");
    const parsed = contracts.sectionEditMetadataSchema.safeParse({
      sectionName: "invalid",
    });
    expect(parsed.success).toBe(false);
  });
});
