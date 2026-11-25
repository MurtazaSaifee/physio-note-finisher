import { describe, expect, it } from "vitest";

import { normalizeApiKey } from "../../src/config/env.js";
import {
  DEMO_TRANSCRIPT,
} from "../../src/domain/voice/providers/demoVoiceProviders.js";
import {
  createLocalVoiceProviders,
  resolveLocalLlmChoice,
  resolveLocalSttChoice,
} from "../../src/domain/voice/providers/localVoiceProviders.js";
import { resolveVoiceProviders } from "../../src/domain/voice/providers/providerRegistry.js";

const NO_SPOKENLY_PATH = "/nonexistent-bin";

describe("zero-key local demo mode", () => {
  it.each([undefined, "", "   ", "replace-with-your-sarvam-api-key", "your-key-here", "<sarvam-key>"])(
    "treats %j as an unconfigured API key",
    (value) => {
      expect(normalizeApiKey(value)).toBeUndefined();
    },
  );

  it("keeps a real-looking key", () => {
    expect(normalizeApiKey("  sk_live_abc123  ")).toBe("sk_live_abc123");
  });

  it("does not build cloud providers from a placeholder key", () => {
    expect(
      resolveVoiceProviders({ SARVAM_API_KEY: "replace-with-your-sarvam-api-key" }),
    ).toBeUndefined();
  });

  it("falls back to the offline stub when neither Spokenly nor a key is available", () => {
    expect(resolveLocalSttChoice({ PATH: NO_SPOKENLY_PATH })).toBe("stub");
    expect(resolveLocalLlmChoice({}, undefined)).toBe("stub");
  });

  it("never selects Sarvam speech-to-text implicitly", () => {
    expect(
      resolveLocalSttChoice({ PATH: NO_SPOKENLY_PATH, SARVAM_API_KEY: "real-key" }),
    ).toBe("stub");
  });

  it("honours explicit provider choices and rejects unknown ones", () => {
    expect(resolveLocalSttChoice({ LOCAL_STT_PROVIDER: "spokenly" })).toBe("spokenly");
    expect(resolveLocalLlmChoice({ LOCAL_LLM_PROVIDER: "stub" }, "real-key")).toBe("stub");
    expect(() => resolveLocalSttChoice({ LOCAL_STT_PROVIDER: "whisper" })).toThrow();
    expect(() => resolveLocalLlmChoice({ LOCAL_LLM_PROVIDER: "sarvam" }, undefined)).toThrow();
  });

  it("runs transcript → SOAP → patient summary end to end with no keys", async () => {
    const providers = createLocalVoiceProviders({ PATH: NO_SPOKENLY_PATH });

    const transcript = await providers.sttProvider!.transcribe(Buffer.alloc(32_000), {
      mimeType: "audio/m4a",
    } as never);
    expect(transcript.transcript).toBe(DEMO_TRANSCRIPT);

    const soap = await providers.clinicalNoteProvider!.generateSoapDraft({
      transcript: transcript.transcript,
    } as never);
    expect(soap.objective).toContain("Knee flexion 120°");

    const summary = await providers.patientSummaryProvider!.generatePatientSummary({
      validatedSoap: soap,
    } as never);
    expect(summary.message).toContain("Your knee is healing well");
    expect(summary.followUp).toBe("Next visit in 2 weeks.");
  });
});
