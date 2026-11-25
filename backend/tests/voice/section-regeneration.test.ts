import { describe, expect, it } from "vitest";

import { regenerateSoapSection } from "../../src/domain/voice/soapGenerationService.js";

describe("soapGenerationService.regenerateSoapSection", () => {
  it("updates only the targeted section and preserves all others", async () => {
    const sections = {
      subjective: "Pain reduced to 3/10 with morning stiffness.",
      objective: "Knee flexion improved from 90 to 110 degrees.",
      assessment: "Progressing well with loading tolerance.",
      plan: "Continue progressive strengthening and review in 1 week.",
    } as const;

    const regenerated = await regenerateSoapSection({
      clinicId: "clinic-1",
      patientId: "patient-1",
      transcriptText: "Patient can climb stairs with mild discomfort.",
      targetSection: "plan",
      currentSections: sections,
      hint: "Add specific home exercise progression.",
    });

    expect(regenerated.sections.subjective).toBe(sections.subjective);
    expect(regenerated.sections.objective).toBe(sections.objective);
    expect(regenerated.sections.assessment).toBe(sections.assessment);
    expect(regenerated.sections.plan).toContain("home exercise");
  });

  it("allows regeneration when non-target sections are still empty", async () => {
    const regenerated = await regenerateSoapSection({
      clinicId: "clinic-1",
      patientId: "patient-1",
      transcriptText: "Patient reports lower pain with activity pacing.",
      targetSection: "assessment",
      currentSections: {
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      },
    });

    expect(regenerated.sections.subjective).toBe("");
    expect(regenerated.sections.objective).toBe("");
    expect(regenerated.sections.plan).toBe("");
    expect(regenerated.sections.assessment.length).toBeGreaterThan(0);
  });
});
