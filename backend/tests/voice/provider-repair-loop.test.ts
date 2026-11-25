import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

import { resolveVoiceProviderConfig } from "../../src/domain/voice/providerMatrixConfig.js";
import {
  runWithRepairLoop,
  AiRepairLoopExhaustedError,
} from "../../src/domain/voice/withRepairLoop.js";

describe("providerMatrixConfig", () => {
  it("selects Sarvam defaults when no override provided (D-06)", () => {
    const config = resolveVoiceProviderConfig({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_LLM_DEFAULT_MODEL: "sarvam-m",
    });
    expect(config.provider).toBe("sarvam");
    expect(config.llmModel).toBe("sarvam-m");
  });

  it("rejects invalid provider matrix JSON at startup parse (D-05)", () => {
    expect(() =>
      resolveVoiceProviderConfig({
        VOICE_PROVIDER_MATRIX_JSON: "not-json",
      }),
    ).toThrow("not valid JSON");
  });

  it("rejects malformed provider matrix shape at startup parse (D-05)", () => {
    expect(() =>
      resolveVoiceProviderConfig({
        VOICE_PROVIDER_MATRIX_JSON: JSON.stringify({
          sarvam: "not-an-object",
        }),
      }),
    ).toThrow("Invalid provider matrix shape");
  });

  it("resolves provider and model from valid matrix JSON", () => {
    const config = resolveVoiceProviderConfig({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_LLM_DEFAULT_MODEL: "sarvam-m",
      VOICE_PROVIDER_MATRIX_JSON: JSON.stringify({
        sarvam: {
          provider: "sarvam",
          sttModel: "saaras-v3",
          llmModel: "sarvam-105b",
        },
        openai: { provider: "openai", llmModel: "gpt-4" },
      }),
    });
    expect(config.provider).toBe("sarvam");
    expect(config.sttModel).toBe("saaras-v3");
    expect(config.llmModel).toBe("sarvam-105b");
  });

  it("falls back to default model when matrix entry omits llmModel", () => {
    const config = resolveVoiceProviderConfig({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_LLM_DEFAULT_MODEL: "sarvam-m",
      VOICE_PROVIDER_MATRIX_JSON: JSON.stringify({
        sarvam: { provider: "sarvam", sttModel: "saaras-v3" },
      }),
    });
    expect(config.llmModel).toBe("sarvam-m");
  });

  it("falls back to the default STT model when matrix entry omits sttModel", () => {
    const config = resolveVoiceProviderConfig({
      VOICE_PROVIDER_DEFAULT: "sarvam",
      VOICE_STT_DEFAULT_MODEL: "saaras-fallback",
      VOICE_LLM_DEFAULT_MODEL: "sarvam-m",
      VOICE_PROVIDER_MATRIX_JSON: JSON.stringify({
        sarvam: { provider: "sarvam", llmModel: "sarvam-105b" },
      }),
    });
    expect(config.sttModel).toBe("saaras-fallback");
  });
});

describe("repairLoop", () => {
  it("fails after 3 repair attempts on schema-invalid output (D-08)", async () => {
    const schema = z.object({ required: z.string().min(1) });
    let callCount = 0;
    const failingGenerator = async () => {
      callCount++;
      return { required: "" };
    };

    await expect(
      runWithRepairLoop(failingGenerator, schema, "soap", 3),
    ).rejects.toThrow(
      "soap_failed:invalid_llm_output after 3 repair attempts",
    );

    expect(callCount).toBe(3);
  });

  it("returns on first valid output without extra attempts", async () => {
    const schema = z.object({ value: z.number() });
    let callCount = 0;
    const generator = async () => {
      callCount++;
      return { value: 42 };
    };

    const result = await runWithRepairLoop(generator, schema, "test", 3);
    expect(result.value).toBe(42);
    expect(callCount).toBe(1);
  });

  it("retries on intermittent invalid output then succeeds", async () => {
    const schema = z.object({ ok: z.literal(true) });
    let callCount = 0;
    const flakyGenerator = async () => {
      callCount++;
      return { ok: callCount >= 2 };
    };

    const result = await runWithRepairLoop(flakyGenerator, schema, "soap", 3);
    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it("throws AiRepairLoopExhaustedError with stage name and attempts", async () => {
    const schema = z.string().min(1);
    const generator = async () => "";

    try {
      await runWithRepairLoop(generator, schema, "summary", 3);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AiRepairLoopExhaustedError);
      expect((error as AiRepairLoopExhaustedError).stageName).toBe("summary");
      expect((error as AiRepairLoopExhaustedError).attempts).toBe(3);
    }
  });

  it("uses repairFn on first failure then regenerates once before throwing (D-12)", async () => {
    const schema = z.object({ value: z.string().min(1) });
    let generateCount = 0;
    let repairCount = 0;

    // Always returns empty (invalid)
    const generator = async () => {
      generateCount++;
      return { value: "" };
    };

    // Repair also returns empty (invalid)
    const repairFn = async (_raw: unknown, _err: z.ZodError) => {
      repairCount++;
      return { value: "" };
    };

    await expect(
      runWithRepairLoop(generator, schema, "soap", { repairFn }),
    ).rejects.toThrow(AiRepairLoopExhaustedError);

    // Should have called generate at least 2 times (initial + one retry)
    expect(generateCount).toBeGreaterThanOrEqual(2);
    // Should have called repair at least once
    expect(repairCount).toBeGreaterThanOrEqual(1);
  });

  it("succeeds when repairFn fixes invalid output (D-12)", async () => {
    const schema = z.object({ value: z.string().min(1) });
    let generateCount = 0;
    let repairCount = 0;

    // First generate returns empty (invalid)
    const generator = async () => {
      generateCount++;
      return { value: "" };
    };

    // Repair returns valid output
    const repairFn = async (_raw: unknown, _err: z.ZodError) => {
      repairCount++;
      return { value: "fixed" };
    };

    const result = await runWithRepairLoop(generator, schema, "soap", { repairFn });
    expect(result.value).toBe("fixed");
    expect(generateCount).toBe(1);
    expect(repairCount).toBe(1);
  });
});

describe("D-07 no UI path dependency", () => {
  it("shared voice contracts do not expose provider or model selectors", () => {
    const contractPath = resolve(
      process.cwd(),
      "../shared/contracts/voice.ts",
    );
    const content = readFileSync(contractPath, "utf-8");
    const hasProviderFields =
      content.includes("provider") ||
      content.includes("llmModel") ||
      content.includes("sttModel");
    expect(hasProviderFields).toBe(false);
  });
});
