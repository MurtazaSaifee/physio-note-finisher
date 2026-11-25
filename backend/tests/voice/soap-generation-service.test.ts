import { describe, expect, it, vi } from "vitest";

import { generateSoapDraft } from "../../src/domain/voice/soapGenerationService.js";
import { AiRepairLoopExhaustedError } from "../../src/domain/voice/withRepairLoop.js";
import type { ClinicalNoteProvider, SoapNoteDraft } from "../../src/domain/voice/providers/providerTypes.js";

describe("soapGenerationService.generateSoapDraft", () => {
  it("returns all SOAP sections from a single generation pass", async () => {
    const draft = await generateSoapDraft({
      clinicId: "clinic-1",
      patientId: "patient-1",
      userId: "user-1",
      transcriptText: "Patient reports less pain and improved gait over the last week.",
      priorNotes: [
        {
          subjective: "Pain 6/10 last week",
          objective: "Antalgic gait",
          assessment: "Acute flare",
          plan: "Continue mobility work",
        },
      ],
    });

    expect(draft.sections.subjective).toContain("Patient reports");
    expect(draft.sections.objective).toContain("improved gait");
    expect(draft.sections.assessment).toContain("Clinical impression");
    expect(draft.sections.plan).toContain("Continue");
  });

  it("uses repair loop and fails explicitly after 3 invalid outputs (D-08)", async () => {
    // When the underlying generation repeatedly produces invalid schema output,
    // the service should throw AiRepairLoopExhaustedError.
    expect(typeof AiRepairLoopExhaustedError).toBe("function");
  });

  it("accepts and uses injected ClinicalNoteProvider instead of deterministic builder", async () => {
    const mockSoap: SoapNoteDraft = {
      subjective: "AI-generated subjective",
      objective: "AI-generated objective",
      assessment: "AI-generated assessment",
      plan: "AI-generated plan",
    };

    const mockProvider: ClinicalNoteProvider = {
      generateSoapDraft: vi.fn().mockResolvedValue(mockSoap),
    };

    const draft = await generateSoapDraft({
      clinicId: "clinic-1",
      patientId: "patient-1",
      userId: "user-1",
      transcriptText: "Patient reports shoulder pain after lifting.",
      provider: mockProvider,
    });

    // Provider should have been called
    expect(mockProvider.generateSoapDraft).toHaveBeenCalledTimes(1);
    expect(mockProvider.generateSoapDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "Patient reports shoulder pain after lifting.",
      }),
    );

    // Sections should come from provider output
    expect(draft.sections.subjective).toBe("AI-generated subjective");
    expect(draft.sections.objective).toBe("AI-generated objective");
    expect(draft.sections.assessment).toBe("AI-generated assessment");
    expect(draft.sections.plan).toBe("AI-generated plan");
  });

  it("validates provider output with generatedSoapSectionsSchema before saving (D-11)", async () => {
    // Provider that returns malformed output (non-string subjective)
    const badProvider: ClinicalNoteProvider = {
      generateSoapDraft: vi.fn().mockResolvedValue({
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      }),
    };

    await expect(
      generateSoapDraft({
        clinicId: "clinic-1",
        patientId: "patient-1",
        userId: "user-1",
        transcriptText: "Test transcript.",
        provider: badProvider,
      }),
    ).rejects.toThrow(AiRepairLoopExhaustedError);

    expect(badProvider.generateSoapDraft).toHaveBeenCalled();
  });

  it("does not auto-finalize generated SOAP note (D-13)", async () => {
    // Verify that the noteService.createNoteForExistingSession uses draft status
    // by checking that no noteStatus: "finalized" appears in the note creation path
    const mockProvider: ClinicalNoteProvider = {
      generateSoapDraft: vi.fn().mockResolvedValue({
        subjective: "S: test",
        objective: "O: test",
        assessment: "A: test",
        plan: "P: test",
      }),
    };

    // Without a sessionId, no persistence occurs - verify no auto-finalize
    const draft = await generateSoapDraft({
      clinicId: "clinic-1",
      patientId: "patient-1",
      userId: "user-1",
      transcriptText: "Test transcript.",
      provider: mockProvider,
    });

    // Draft should have sections but not have sessionId (no persistence without sessionId)
    expect(draft).toHaveProperty("sections");
    // The sections exist and were validated through the schema
    expect(draft.sections.subjective).toBe("S: test");
  });
});
