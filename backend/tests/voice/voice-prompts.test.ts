import { describe, expect, it } from "vitest";

import { buildSoapSystemPrompt, buildSoapUserPrompt } from "../../src/domain/voice/prompts/soapPrompt.js";
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from "../../src/domain/voice/prompts/patientSummaryPrompt.js";

describe("voice prompt builders", () => {
  it("keeps the SOAP prompt domain-specific and provider-agnostic", () => {
    const systemPrompt = buildSoapSystemPrompt();
    const userPrompt = buildSoapUserPrompt({
      transcript: "Patient reports knee pain after stairs.",
    });

    expect(systemPrompt).toContain("clinical documentation assistant");
    expect(systemPrompt).not.toContain("Sarvam");
    expect(systemPrompt).toContain("Do not wrap the JSON in markdown fences.");
    expect(userPrompt).toContain("Transcript: Patient reports knee pain after stairs.");
    expect(userPrompt).toContain("Return JSON only");
    expect(userPrompt).not.toContain("Sarvam");
  });

  it("keeps the patient summary prompt domain-specific and provider-agnostic", () => {
    const systemPrompt = buildSummarySystemPrompt();
    const userPrompt = buildSummaryUserPrompt({
      validatedSoap: {
        subjective: "Pain improved.",
        objective: "Walking with less limp.",
        assessment: "Recovery is on track.",
        plan: "Continue exercises.",
      },
    });

    expect(systemPrompt).toContain("patient-friendly summary");
    expect(systemPrompt).not.toContain("Sarvam");
    expect(systemPrompt).toContain("Do not wrap the JSON in markdown fences.");
    expect(userPrompt).toContain("SOAP Note:");
    expect(userPrompt).toContain("Return JSON only");
    expect(userPrompt).not.toContain("Sarvam");
  });
});
