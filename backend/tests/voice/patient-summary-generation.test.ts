import { describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  generatePatientSummary,
  savePatientSummary,
} from "../../src/domain/voice/patientSummaryService.js";
import { AiRepairLoopExhaustedError } from "../../src/domain/voice/withRepairLoop.js";
import type { PatientSummaryProvider, PatientSummaryDraft } from "../../src/domain/voice/providers/providerTypes.js";

describe("patientSummaryService", () => {
  it("generates a narrative paragraph and avoids bullet-list output", async () => {
    const summary = await generatePatientSummary({
      subjective: "Patient reports reduced pain with stairs and improved confidence.",
      objective: "Observed smoother gait and better single-leg balance control.",
      assessment: "Clinical progress is steady with functional gains this week.",
      plan: "Continue progressive loading, home exercise adherence, and review in one week.",
    });

    expect(summary).toContain("You reported");
    expect(summary).not.toMatch(/(^|\n)\s*[-*]\s+/);
    expect(summary).not.toContain("\n");
  });

  it("uses repair loop and fails explicitly after 3 invalid outputs (D-08)", async () => {
    expect(typeof AiRepairLoopExhaustedError).toBe("function");
  });

  it("persists summary against clinic-scoped session context", async () => {
    const updateSpy = vi.spyOn(prisma.session, "update").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientSummary: "Summary updated",
    } as never);

    await savePatientSummary({
      clinicId: "clinic-1",
      sessionId: "session-1",
      summaryText: "  Summary updated  ",
    });

    expect(updateSpy).toHaveBeenCalledWith({
      where: {
        id_clinicId: {
          id: "session-1",
          clinicId: "clinic-1",
        },
      },
      data: {
        patientSummary: "Summary updated",
      },
      select: {
        id: true,
        clinicId: true,
        patientSummary: true,
      },
    });
  });

  it("accepts and uses injected PatientSummaryProvider (D-11, D-14)", async () => {
    const mockSummary: PatientSummaryDraft = {
      message: "AI-generated patient summary.",
      safetyNote: null,
      followUp: "Next visit in one week.",
    };

    const mockProvider: PatientSummaryProvider = {
      generatePatientSummary: vi.fn().mockResolvedValue(mockSummary),
    };

    const result = await generatePatientSummary(
      {
        subjective: "S: test",
        objective: "O: test",
        assessment: "A: test",
        plan: "P: test",
      },
      { provider: mockProvider },
    );

    expect(mockProvider.generatePatientSummary).toHaveBeenCalledTimes(1);
    expect(result).toContain("AI-generated patient summary");
  });

  it("falls back to a deterministic summary when provider output is invalid", async () => {
    // Provider returns an invalid empty message
    const badProvider: PatientSummaryProvider = {
      generatePatientSummary: vi.fn().mockResolvedValue({
        message: "",
        safetyNote: null,
        followUp: null,
      }),
    };

    const result = await generatePatientSummary(
      {
        subjective: "S: test",
        objective: "O: test",
        assessment: "A: test",
        plan: "P: test",
      },
      { provider: badProvider },
    );

    expect(result).toContain("You reported");
    expect(badProvider.generatePatientSummary).toHaveBeenCalled();
  });

  it("logs a safe failure code without provider error text when falling back", async () => {
    const providerText = "Patient Asha Sharma reports severe L4-L5 pain; token=provider-secret-987";
    const errorLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failedProvider: PatientSummaryProvider = {
      generatePatientSummary: vi.fn().mockRejectedValue(new Error(providerText)),
    };

    try {
      const result = await generatePatientSummary(
        {
          subjective: "S: test",
          objective: "O: test",
          assessment: "A: test",
          plan: "P: test",
        },
        { provider: failedProvider },
      );

      const serializedLogs = errorLog.mock.calls.flat().join(" ");
      expect(result).toContain("You reported");
      expect(serializedLogs).toContain('"errorCode":"provider_summary_request_failed"');
      expect(serializedLogs).toContain('"errorClass":"ProviderFailure"');
      expect(serializedLogs).not.toContain(providerText);
      expect(serializedLogs).not.toContain("provider-secret-987");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("keeps deterministic fallback summaries within the validation limit for long notes", async () => {
    const repeated = "Patient continues to report persistent neck pain, posture-related aggravation, and gradual functional recovery with therapy. ";

    const result = await generatePatientSummary({
      subjective: repeated.repeat(12),
      objective: repeated.repeat(12),
      assessment: repeated.repeat(12),
      plan: repeated.repeat(12),
    });

    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain("You reported");
  });
});
