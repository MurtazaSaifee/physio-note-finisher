import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveVoiceProviders } from "../../src/domain/voice/providers/providerRegistry.js";

describe("voiceProviderRegistry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no providers when Sarvam is configured but the API key is missing", () => {
    const providers = resolveVoiceProviders({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_LLM_DEFAULT_MODEL: "sarvam-105b",
      VOICE_STT_DEFAULT_MODEL: "saaras:v3",
    });

    expect(providers).toBeUndefined();
  });

  it("creates a Sarvam bundle when the provider and API key are configured", () => {
    const providers = resolveVoiceProviders({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_LLM_DEFAULT_MODEL: "custom-llm",
      VOICE_STT_DEFAULT_MODEL: "custom-stt",
      SARVAM_API_KEY: "sarvam-test-key",
    });

    expect(providers).toBeDefined();
    expect(providers?.sttProvider).toBeDefined();
    expect(providers?.clinicalNoteProvider).toBeDefined();
    expect(providers?.patientSummaryProvider).toBeDefined();
  });

  it("rejects unsupported voice providers", () => {
    expect(() =>
      resolveVoiceProviders({
        VOICE_PROVIDER_DEFAULT: "openai",
        VOICE_LLM_DEFAULT_MODEL: "gpt-4o",
        VOICE_STT_DEFAULT_MODEL: "whisper-1",
        SARVAM_API_KEY: "not-used",
      }),
    ).toThrow("Unsupported voice provider");
  });
});
