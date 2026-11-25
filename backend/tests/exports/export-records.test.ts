import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { registerExportRoutes } from "../../src/api/routes/exports.js";
import type { ExportQueue } from "../../src/domain/exports/exportRecordService.js";

vi.mock("../../src/domain/audit/auditService.js", () => ({
  createAuditEvent: vi.fn(async () => undefined),
}));

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

async function buildApp(exportQueue?: ExportQueue): Promise<FastifyInstance> {
  const app = Fastify();
  registerExportRoutes(app, exportQueue);
  await app.ready();
  return app;
}

beforeEach(() => {
  setAuthEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("exportRecordService", () => {
  it("rejects export creation when the clinic-scoped session is not finalized or belongs to a different patient", async () => {
    const exportRecordService = await import(
      "../../src/domain/exports/exportRecordService.js"
    );

    vi.spyOn(prisma.session, "findFirst")
      .mockResolvedValueOnce({
        id: "session-1",
        clinicId: "clinic-1",
        patientId: "patient-2",
        noteStatus: "finalized",
      } as never)
      .mockResolvedValueOnce({
        id: "session-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        noteStatus: "draft",
      } as never);

    await expect(
      exportRecordService.createExportRecord({
        clinicId: "clinic-1",
        userId: "user-1",
        patientId: "patient-1",
        sessionId: "session-1",
        input: {
          action: "saved",
          type: "fullNote",
          format: "pdf",
        },
      }),
    ).rejects.toBeInstanceOf(exportRecordService.InvalidExportRecordError);

    await expect(
      exportRecordService.createExportRecord({
        clinicId: "clinic-1",
        userId: "user-1",
        patientId: "patient-1",
        sessionId: "session-1",
        input: {
          action: "shared",
          type: "patientSummary",
          format: "text",
        },
      }),
    ).rejects.toBeInstanceOf(exportRecordService.InvalidExportRecordError);
  });

  it("creates and lists patient export records in reverse chronological order", async () => {
    const exportRecordService = await import(
      "../../src/domain/exports/exportRecordService.js"
    );

    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);
    vi.spyOn(prisma.exportRecord, "create")
      .mockResolvedValueOnce({
        id: "record-1",
        sessionId: "session-1",
        action: "saved",
        type: "fullNote",
        format: "pdf",
        exportedByUserId: "user-1",
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
      } as never)
      .mockResolvedValueOnce({
        id: "record-2",
        sessionId: "session-1",
        action: "shared",
        type: "patientSummary",
        format: "text",
        exportedByUserId: "user-1",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      } as never);
    vi.spyOn(prisma.exportRecord, "findMany").mockResolvedValue([
      {
        id: "record-2",
        sessionId: "session-1",
        action: "shared",
        type: "patientSummary",
        format: "text",
        exportedByUserId: "user-1",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      },
      {
        id: "record-1",
        sessionId: "session-1",
        action: "saved",
        type: "fullNote",
        format: "pdf",
        exportedByUserId: "user-1",
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
      },
    ] as never);

    const created = await exportRecordService.createExportRecord({
      clinicId: "clinic-1",
      userId: "user-1",
      patientId: "patient-1",
      sessionId: "session-1",
      input: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });

    const second = await exportRecordService.createExportRecord({
      clinicId: "clinic-1",
      userId: "user-1",
      patientId: "patient-1",
      sessionId: "session-1",
      input: {
        action: "shared",
        type: "patientSummary",
        format: "text",
      },
    });

    const listed = await exportRecordService.listPatientExportRecords({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });

    expect(created).toEqual({
      id: expect.any(String),
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
	      fileStatus: null,
	      fileError: null,
	      fileExpiresAt: null,
	      fileSizeBytes: null,
	      createdAt: expect.any(String),
	    });
    expect(second).toEqual(
      expect.objectContaining({
        action: "shared",
        type: "patientSummary",
        format: "text",
      }),
    );
    expect(listed).toEqual({
      patientId: "patient-1",
      records: [
        expect.objectContaining({ id: second.id, action: "shared" }),
        expect.objectContaining({ id: created.id, action: "saved" }),
      ],
    });
  });

  it("creates and lists export records through protected clinic-scoped routes", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);
    vi.spyOn(prisma.exportRecord, "create")
      .mockResolvedValueOnce({
        id: "record-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        exportedByUserId: "user-1",
        action: "saved",
        type: "fullNote",
        format: "pdf",
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
      } as never)
      .mockResolvedValueOnce({
        id: "record-2",
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        exportedByUserId: "user-1",
        action: "shared",
        type: "patientSummary",
        format: "text",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      } as never);
    vi.spyOn(prisma.exportRecord, "findMany").mockResolvedValue([
      {
        id: "record-2",
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        exportedByUserId: "user-1",
        action: "shared",
        type: "patientSummary",
        format: "text",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      },
      {
        id: "record-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        exportedByUserId: "user-1",
        action: "saved",
        type: "fullNote",
        format: "pdf",
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
      },
    ] as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        action: "shared",
        type: "patientSummary",
        format: "text",
      },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(secondCreateResponse.statusCode).toBe(201);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      success: true,
      data: {
        patientId: "patient-1",
        records: [
          expect.objectContaining({ id: "record-2", action: "shared" }),
          expect.objectContaining({ id: "record-1", action: "saved" }),
        ],
      },
    });
  });

  it("accepts copied export actions from the note copy flow", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);
    const exportCreateSpy = vi.spyOn(prisma.exportRecord, "create").mockResolvedValue({
      id: "record-copy-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      exportedByUserId: "user-1",
      action: "copied",
      type: "fullNote",
      format: "text",
      createdAt: new Date("2026-04-30T09:00:00.000Z"),
    } as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        action: "copied",
        type: "fullNote",
        format: "text",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(exportCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "copied",
          type: "fullNote",
          format: "text",
        }),
      }),
    );
  });

  it("enqueues PDF export generation after creating an export record", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);
    vi.spyOn(prisma.exportRecord, "create").mockResolvedValue({
      id: "record-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      exportedByUserId: "user-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      createdAt: new Date("2026-04-30T09:00:00.000Z"),
    } as never);

    const queue = {
      add: vi.fn(
        () =>
          new Promise<unknown>(() => {
            // Intentionally never resolves so the route must not await it.
          }),
      ),
    } satisfies ExportQueue;
    const app = await buildApp(queue);
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(queue.add).toHaveBeenCalledWith(
      "generate_pdf",
      { exportId: "record-1", clinicId: "clinic-1", sessionId: "session-1" },
      expect.objectContaining({ jobId: "record-1-pdf" }),
    );
  });

  it("marks the PDF export failed when the queue rejects after the response", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);
    vi.spyOn(prisma.exportRecord, "create").mockResolvedValue({
      id: "record-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      exportedByUserId: "user-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      createdAt: new Date("2026-04-30T09:00:00.000Z"),
    } as never);
    const updateSpy = vi.spyOn(prisma.exportRecord, "update").mockResolvedValue({
      id: "record-1",
      fileStatus: "failed",
      fileError: "Queue unavailable",
    } as never);

    const queue = {
      add: vi.fn(async () => {
        throw new Error("Queue unavailable");
      }),
    } satisfies ExportQueue;
    const app = await buildApp(queue);
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/export-records",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      },
    });

    expect(response.statusCode).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: expect.objectContaining({
        fileStatus: "failed",
        fileError: "Queue unavailable",
      }),
    });
  });
});
