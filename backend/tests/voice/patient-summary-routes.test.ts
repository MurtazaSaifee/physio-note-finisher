import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";

const mocks = vi.hoisted(() => ({
  getManualNote: vi.fn(),
  generatePatientSummary: vi.fn(),
  savePatientSummary: vi.fn(),
}));

vi.mock("../../src/domain/voice/voiceConsentService.js", () => ({
  assertPatientAiConsent: vi.fn(async () => undefined),
  PatientConsentRequiredError: class PatientConsentRequiredError extends Error {
    readonly errorCode = "patient_consent_required";
  },
}));

vi.mock("../../src/domain/notes/noteService.js", () => ({
  NoteNotFoundError: class NoteNotFoundError extends Error {
    constructor() {
      super("Note not found");
      this.name = "NoteNotFoundError";
    }
  },
  SessionNotFoundError: class SessionNotFoundError extends Error {
    constructor() {
      super("Session not found");
      this.name = "SessionNotFoundError";
    }
  },
  getManualNote: mocks.getManualNote,
}));

vi.mock("../../src/domain/voice/patientSummaryService.js", () => ({
  generatePatientSummary: mocks.generatePatientSummary,
  savePatientSummary: mocks.savePatientSummary,
}));

import { registerPatientSummaryRoutes } from "../../src/api/routes/patientSummary.js";

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

describe("patientSummaryRoutes", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a generic error when summary generation fails", async () => {
    const providerText = "Patient Asha Sharma reports severe L4-L5 pain; token=provider-secret-987";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getManualNote.mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-05-13T00:00:00.000Z",
      visitType: "manual SOAP note",
      noteStatus: "draft",
      sections: {
        subjective: "Knee pain.",
        objective: "Limited flexion.",
        assessment: "Likely overload.",
        plan: "Continue exercises.",
      },
      templateKey: null,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    });
    const providerError = new Error(providerText);
    providerError.name = providerText;
    mocks.generatePatientSummary.mockRejectedValue(providerError);

    const app = Fastify();
    registerPatientSummaryRoutes(app);
    await app.ready();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/voice/summary/generate",
        headers: {
          authorization: `Bearer ${createAccessToken("clinic-1")}`,
        },
        payload: {
          patientId: "patient-1",
          sessionId: "session-1",
        },
      });

      const serializedLogs = errorLog.mock.calls.flat().join(" ");
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Patient summary request failed" });
      expect(mocks.savePatientSummary).not.toHaveBeenCalled();
      expect(serializedLogs).toContain('"errorCode":"patient_summary_generation_failed"');
      expect(serializedLogs).toContain('"errorClass":"PatientSummaryFailure"');
      expect(serializedLogs).not.toContain(providerText);
      expect(serializedLogs).not.toContain("provider-secret-987");
    } finally {
      errorLog.mockRestore();
      await app.close();
    }
  });

  it("does not log raw summary save failures", async () => {
    const providerText = "Patient Vivek Rao reports new weakness; token=provider-secret-654";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getManualNote.mockResolvedValue({ id: "note-1" });
    const providerError = new Error(providerText);
    providerError.name = providerText;
    mocks.savePatientSummary.mockRejectedValue(providerError);

    const app = Fastify();
    registerPatientSummaryRoutes(app);
    await app.ready();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/voice/summary/save",
        headers: {
          authorization: `Bearer ${createAccessToken("clinic-1")}`,
        },
        payload: {
          patientId: "patient-1",
          sessionId: "session-1",
          patientSummary: "Continue the agreed home exercise plan.",
        },
      });

      const serializedLogs = errorLog.mock.calls.flat().join(" ");
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Patient summary request failed" });
      expect(serializedLogs).toContain('"errorCode":"patient_summary_save_failed"');
      expect(serializedLogs).toContain('"errorClass":"PatientSummaryFailure"');
      expect(serializedLogs).not.toContain(providerText);
      expect(serializedLogs).not.toContain("provider-secret-654");
    } finally {
      errorLog.mockRestore();
      await app.close();
    }
  });
});
