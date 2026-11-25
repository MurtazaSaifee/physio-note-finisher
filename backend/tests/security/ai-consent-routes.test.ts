import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";

const { assertPatientAiConsent } = vi.hoisted(() => ({
  assertPatientAiConsent: vi.fn(),
}));

vi.mock("../../src/domain/voice/voiceConsentService.js", () => {
  class PatientConsentRequiredError extends Error {
    readonly errorCode = "patient_consent_required";
  }

  return {
    assertPatientAiConsent,
    PatientConsentRequiredError,
  };
});

vi.mock("../../src/domain/voice/soapGenerationService.js", () => ({
  generateSoapDraft: vi.fn(async () => ({
    sessionId: "session-1",
    patientId: "patient-1",
    sections: {
      subjective: "Subjective",
      objective: "Objective",
      assessment: "Assessment",
      plan: "Plan",
    },
  })),
  regenerateSoapSection: vi.fn(),
}));

vi.mock("../../src/domain/notes/noteService.js", () => ({
  getManualNote: vi.fn(async () => ({
    sections: {
      subjective: "Subjective",
      objective: "Objective",
      assessment: "Assessment",
      plan: "Plan",
    },
  })),
  NoteNotFoundError: class NoteNotFoundError extends Error {},
  SessionNotFoundError: class SessionNotFoundError extends Error {},
}));

vi.mock("../../src/domain/voice/patientSummaryService.js", () => ({
  generatePatientSummary: vi.fn(async () => "Patient summary"),
  savePatientSummary: vi.fn(async () => ({
    patientSummary: "Patient summary",
  })),
}));

import { registerPatientSummaryRoutes } from "../../src/api/routes/patientSummary.js";
import { registerSoapGenerationRoutes } from "../../src/api/routes/soapGeneration.js";

function configureTestEnvironment(): string {
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
    SARVAM_API_KEY: "test-sarvam-key",
  });

  return issueTokenPair({
    sub: "user-1",
    clinicId: "clinic-1",
    sessionId: "auth-session-1",
    tokenVersion: 0,
  }).accessToken;
}

describe("AI route consent enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      register: registerSoapGenerationRoutes,
      url: "/api/v1/voice/soap/generate",
      payload: {
        patientId: "patient-1",
        sessionId: "session-1",
        transcriptText: "Clinical transcript",
      },
    },
    {
      register: registerSoapGenerationRoutes,
      url: "/api/v1/voice/soap/regenerate-section",
      payload: {
        patientId: "patient-1",
        sessionId: "session-1",
        transcriptText: "Clinical transcript",
        section: "plan",
      },
    },
    {
      register: registerPatientSummaryRoutes,
      url: "/api/v1/voice/summary/generate",
      payload: {
        patientId: "patient-1",
        sessionId: "session-1",
      },
    },
  ])("rejects $url when patient consent is absent", async ({ register, url, payload }) => {
    const token = configureTestEnvironment();
    const ConsentError = (await import(
      "../../src/domain/voice/voiceConsentService.js"
    )).PatientConsentRequiredError;
    assertPatientAiConsent.mockRejectedValueOnce(new ConsentError());

    const app = Fastify();
    register(app);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "patient_consent_required" });
    expect(assertPatientAiConsent).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });
    await app.close();
  });
});
