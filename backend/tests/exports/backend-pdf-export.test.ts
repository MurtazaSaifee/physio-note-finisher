import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: {
    exportRecord: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    progressNote: {
      findFirst: vi.fn(),
    },
    patient: {
      findFirst: vi.fn(),
    },
    clinic: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/infrastructure/s3/s3Client.js", () => ({
  putObject: vi.fn(),
  createPresignedDownloadUrl: vi.fn(),
  objectExists: vi.fn(),
}));

vi.mock("../../src/domain/audit/auditService.js", () => ({
  createAuditEvent: vi.fn(async () => undefined),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "../../src/data/prismaClient.js";
import { putObject, createPresignedDownloadUrl } from "../../src/infrastructure/s3/s3Client.js";
import { createExportRecord } from "../../src/domain/exports/exportRecordService.js";
import { registerExportRoutes } from "../../src/api/routes/exports.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import type { CreateExportRecordRequest } from "../../../shared/contracts/exports.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerExportRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  setAuthEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ── Task 1 Tests ─────────────────────────────────────────────────────────────

describe("pdfExportService", () => {
  it("sanitizePdfText strips control characters without HTML escaping clinical text", async () => {
    const { sanitizePdfText } = await import(
      "../../src/domain/exports/pdfExportService.js"
    );

    expect(sanitizePdfText("ROM\u0000 45\u0008 degrees")).toBe(
      "ROM 45 degrees",
    );
    expect(sanitizePdfText('Patient reports <b>neck pain</b>')).toBe(
      "Patient reports <b>neck pain</b>",
    );
  });

  it("generateSoapPdfExport returns a real PDF buffer for SOAP content", async () => {
    const { generateSoapPdfExport } = await import(
      "../../src/domain/exports/pdfExportService.js"
    );

    const pdfBuffer = await generateSoapPdfExport({
      clinicName: "Test Clinic",
      patientName: "John Doe",
      date: "2026-05-06",
      visitType: "Initial Evaluation",
      subjective: "Patient reports <b>neck pain</b> since 3 days.",
      objective: "ROM: flexion 45°, extension 30°",
      assessment: "Cervical strain with muscle spasm",
      plan: "Continue IFT & exercises. Review in 1 week.",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  it("generatePdfExport accepts legacy HTML strings without rendering raw HTML", async () => {
    const { generatePdfExport } = await import(
      "../../src/domain/exports/pdfExportService.js"
    );

    const pdfBuffer = await generatePdfExport(
      "<html><body><h1>SOAP Note</h1><script>alert('x')</script></body></html>",
    );

    expect(pdfBuffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
});

describe("export creation and queuing", () => {
  it("createExportRecord returns fileStatus 'queued' without rendering inline", async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);

    vi.mocked(prisma.exportRecord.create).mockResolvedValue({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "queued",
      fileError: null,
      fileExpiresAt: null,
      fileStorageKey: null,
      fileSizeBytes: null,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never);

    const record = await createExportRecord({
      clinicId: "clinic-1",
      userId: "user-1",
      patientId: "patient-1",
      sessionId: "session-1",
      input: {
        action: "saved",
        type: "fullNote",
        format: "pdf",
      } satisfies CreateExportRecordRequest,
    });

	    expect(record.fileStatus).toBe("queued");
	    expect(record.fileError).toBeNull();
	    expect(record).not.toHaveProperty("fileStorageKey");
  });

  it("enqueues an export-generation job when queue is provided", async () => {
    const { enqueueExportGeneration } = await import(
      "../../src/domain/exports/exportRecordService.js"
    );

    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);

    vi.mocked(prisma.exportRecord.create).mockResolvedValue({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "queued",
      fileError: null,
      fileExpiresAt: null,
      fileStorageKey: null,
      fileSizeBytes: null,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never);

    const queueAddSpy = vi.fn().mockResolvedValue({ id: "export-1-pdf" });
    const queue = { add: queueAddSpy };

    const result = await enqueueExportGeneration(
      queue,
      "export-1",
      "clinic-1",
      "session-1",
    );

    expect(queueAddSpy).toHaveBeenCalledWith(
      "generate_pdf",
      { exportId: "export-1", clinicId: "clinic-1", sessionId: "session-1" },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        jobId: "export-1-pdf",
      },
    );
    expect(result.jobId).toBe("export-1-pdf");
  });
});

describe("export worker integration", () => {
  it("stores generated PDF at clinics/{clinicId}/exports/{sessionId}/{exportId}.pdf", async () => {
    const { processExportJob } = await import(
      "../../src/workers/exportWorker.js"
    );

    vi.mocked(prisma.exportRecord.findFirst).mockResolvedValue({
      id: "export-1",
      clinicId: "clinic-1",
      sessionId: "session-1",
      patientId: "patient-1",
      fileStatus: "queued",
      format: "pdf",
      type: "fullNote",
      action: "saved",
    } as never);

    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      startedAt: new Date("2026-05-06T09:00:00.000Z"),
      visitType: "Initial Evaluation",
      noteStatus: "finalized",
    } as never);

    vi.mocked(prisma.progressNote.findFirst).mockResolvedValue({
      subjective: "Patient reports neck pain",
      objective: "ROM limited",
      assessment: "Cervical strain",
      plan: "Continue treatment",
    } as never);

    vi.mocked(prisma.patient.findFirst).mockResolvedValue({
      fullName: "John Doe",
    } as never);

    vi.mocked(prisma.clinic.findFirst).mockResolvedValue({
      name: "Test Clinic",
    } as never);

    vi.mocked(prisma.exportRecord.update).mockResolvedValue({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "succeeded",
      fileError: null,
      fileExpiresAt: expect.any(Date) as unknown as Date,
      fileStorageKey: "clinics/clinic-1/exports/session-1/export-1.pdf",
      fileSizeBytes: 1234,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never);

    await processExportJob({
      exportId: "export-1",
      clinicId: "clinic-1",
      sessionId: "session-1",
    });

    expect(putObject).toHaveBeenCalledWith(
      "clinics/clinic-1/exports/session-1/export-1.pdf",
      expect.any(Buffer),
      "application/pdf",
    );

    const expectedKey =
      "clinics/clinic-1/exports/session-1/export-1.pdf";
    const actualKey = vi.mocked(putObject).mock.calls[0]?.[0];
    expect(actualKey).toBe(expectedKey);
  });
});

// ── Task 2 Tests ─────────────────────────────────────────────────────────────

describe("export status route", () => {
  it("GET /exports/:exportId returns status and metadata only (no permanent download URL)", async () => {
    const exportRecord = {
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "succeeded",
      fileError: null,
      fileExpiresAt: null,
      fileStorageKey: "clinics/clinic-1/exports/session-1/export-1.pdf",
      fileSizeBytes: 51200,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never;

    vi.mocked(prisma.exportRecord.findFirst).mockResolvedValue(exportRecord);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1/exports/export-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
	      fileStatus: "succeeded",
	      fileError: null,
	      fileExpiresAt: null,
	      fileSizeBytes: 51200,
	      createdAt: "2026-05-06T10:00:00.000Z",
	    });
    expect(prisma.exportRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          sessionId: "session-1",
        },
      }),
    );
    // Must NOT contain a permanent downloadUrl
    expect(body.data).not.toHaveProperty("downloadUrl");
  });

  it("GET /exports/:exportId returns 404 when the patient scope does not match", async () => {
    const exportRecord = {
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "succeeded",
      fileError: null,
      fileExpiresAt: null,
      fileStorageKey: "clinics/clinic-1/exports/session-1/export-1.pdf",
      fileSizeBytes: 51200,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never;

    vi.mocked(prisma.exportRecord.findFirst).mockImplementation(async (args) => {
      const where = args?.where as {
        id?: string;
        clinicId?: string;
        patientId?: string;
        sessionId?: string;
      };

      if (
        where?.id === "export-1" &&
        where?.clinicId === "clinic-1" &&
        where?.patientId === "patient-1" &&
        where?.sessionId === "session-1"
      ) {
        return exportRecord;
      }

      if (
        where?.id === "export-1" &&
        where?.clinicId === "clinic-1" &&
        where?.patientId == null &&
        where?.sessionId == null
      ) {
        return exportRecord;
      }

      return null;
    });

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-foreign/sessions/session-1/exports/export-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.exportRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-1",
          clinicId: "clinic-1",
          patientId: "patient-foreign",
          sessionId: "session-1",
        },
      }),
    );
  });

  it("GET /exports/:exportId returns 404 when the session scope does not match", async () => {
    const exportRecord = {
      id: "export-1",
      sessionId: "session-1",
      action: "saved",
      type: "fullNote",
      format: "pdf",
      exportedByUserId: "user-1",
      fileStatus: "succeeded",
      fileError: null,
      fileExpiresAt: null,
      fileStorageKey: "clinics/clinic-1/exports/session-1/export-1.pdf",
      fileSizeBytes: 51200,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never;

    vi.mocked(prisma.exportRecord.findFirst).mockImplementation(async (args) => {
      const where = args?.where as {
        id?: string;
        clinicId?: string;
        patientId?: string;
        sessionId?: string;
      };

      if (
        where?.id === "export-1" &&
        where?.clinicId === "clinic-1" &&
        where?.patientId === "patient-1" &&
        where?.sessionId === "session-1"
      ) {
        return exportRecord;
      }

      if (
        where?.id === "export-1" &&
        where?.clinicId === "clinic-1" &&
        where?.patientId == null &&
        where?.sessionId == null
      ) {
        return exportRecord;
      }

      return null;
    });

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-foreign/exports/export-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.exportRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          sessionId: "session-foreign",
        },
      }),
    );
  });
});

describe("export download route", () => {
  it("POST /exports/:exportId/download returns presigned URL with 900s expiry when succeeded", async () => {
    vi.mocked(prisma.exportRecord.findFirst).mockResolvedValue({
      id: "export-1",
      clinicId: "clinic-1",
      sessionId: "session-1",
      patientId: "patient-1",
      fileStatus: "succeeded",
      fileStorageKey: "clinics/clinic-1/exports/session-1/export-1.pdf",
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never);

    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);

    vi.mocked(createPresignedDownloadUrl).mockResolvedValue(
      "https://s3.amazonaws.com/bucket/presigned-url?token=abc",
    );

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/exports/export-1/download",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.downloadUrl).toBe(
      "https://s3.amazonaws.com/bucket/presigned-url?token=abc",
    );
    expect(body.data.expiresAt).toBeDefined();
    expect(createPresignedDownloadUrl).toHaveBeenCalledWith(
      "clinics/clinic-1/exports/session-1/export-1.pdf",
      900,
    );
    expect(prisma.exportRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          sessionId: "session-1",
        },
      }),
    );
  });

  it("POST /exports/:exportId/download returns 404 when export is not bound to route patient/session", async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);

    vi.mocked(prisma.exportRecord.findFirst).mockResolvedValue(null as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/exports/export-foreign/download",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(createPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(prisma.exportRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-foreign",
          clinicId: "clinic-1",
          patientId: "patient-1",
          sessionId: "session-1",
        },
      }),
    );
  });

  it("POST /exports/:exportId/download returns 400 when export not in succeeded status", async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      noteStatus: "finalized",
    } as never);

    vi.mocked(prisma.exportRecord.findFirst).mockResolvedValue({
      id: "export-1",
      clinicId: "clinic-1",
      sessionId: "session-1",
      patientId: "patient-1",
      fileStatus: "queued",
      fileStorageKey: null,
      createdAt: new Date("2026-05-06T10:00:00.000Z"),
    } as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/exports/export-1/download",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it("cross-clinic access returns 403 using existing auth patterns", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-2");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1/exports/export-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
