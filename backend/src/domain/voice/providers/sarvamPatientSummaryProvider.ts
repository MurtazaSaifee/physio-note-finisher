import { z } from "zod";

import type { PatientSummaryProvider, GenerateSummaryInput, PatientSummaryDraft } from "./providerTypes.js";
import { SarvamLlmError, isRetryableHttpStatus } from "./providerErrors.js";
import { buildSarvamHeaders, parseSarvamApiErrorDetails } from "./sarvamApi.js";
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from "../prompts/patientSummaryPrompt.js";

const SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions";

const SARVAM_MODEL = "sarvam-105b";
const SARVAM_TEMPERATURE = 0.2;

const patientSummaryDraftSchema = z.object({
  message: z.string().max(4000),
  language: z.string().max(80).optional(),
  safetyNote: z.string().max(1000).nullable().optional(),
  followUp: z.string().max(1000).nullable().optional(),
}).strict();

const patientSummaryResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "patient_summary_draft",
    description: "Patient-friendly physiotherapy visit summary in structured JSON",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["message"],
      properties: {
        message: { type: "string" },
        language: { type: "string" },
        safetyNote: { type: ["string", "null"] },
        followUp: { type: ["string", "null"] },
      },
    },
  },
} as const;

type SarvamPatientSummaryProviderOptions = {
  model?: string;
  temperature?: number;
};

function parseSummaryContent(raw: unknown, requestId: string | null): PatientSummaryDraft {
  if (typeof raw !== "string") {
    throw new SarvamLlmError("LLM returned non-string content", "invalid_response", requestId, false);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SarvamLlmError("LLM returned empty content", "empty_response", requestId, true);
  }

  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new SarvamLlmError("LLM returned invalid JSON", "invalid_json", requestId, true);
  }

  const validated = patientSummaryDraftSchema.safeParse(parsed);
  if (!validated.success) {
    throw new SarvamLlmError(
      `LLM JSON failed schema validation: ${validated.error.message}`,
      "invalid_json_shape",
      requestId,
      true,
    );
  }

  const { message, language, safetyNote, followUp } = validated.data;

  return {
    message,
    ...(language ? { language } : {}),
    ...(safetyNote !== undefined ? { safetyNote } : {}),
    ...(followUp !== undefined ? { followUp } : {}),
  };
}

export function createSarvamPatientSummaryProvider(
  apiKey: string,
  options: SarvamPatientSummaryProviderOptions = {},
): PatientSummaryProvider {
  const model = options.model ?? SARVAM_MODEL;
  const temperature = options.temperature ?? SARVAM_TEMPERATURE;

  return {
    async generatePatientSummary(input: GenerateSummaryInput): Promise<PatientSummaryDraft> {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSummarySystemPrompt() },
          { role: "user", content: buildSummaryUserPrompt(input) },
        ],
        reasoning_effort: null,
        response_format: patientSummaryResponseFormat,
        temperature,
        top_p: 1.0,
        max_tokens: 1024,
        stream: false,
      });

      let response: Response;
      try {
        response = await fetch(SARVAM_CHAT_URL, {
          method: "POST",
          redirect: "error",
          headers: buildSarvamHeaders(apiKey, {
            "Content-Type": "application/json",
          }),
          body,
        });
      } catch (err) {
        throw new SarvamLlmError(
          "Sarvam patient summary request failed",
          "network_error",
          null,
          true,
        );
      }

      if (!response.ok) {
        const errorDetails = await parseSarvamApiErrorDetails(response);
        throw new SarvamLlmError(
          `Sarvam patient summary request failed (${response.status})`,
          errorDetails.code,
          errorDetails.requestId,
          isRetryableHttpStatus(response.status),
        );
      }

      const result = await response.json() as Record<string, unknown>;
      const requestId = typeof result.id === "string" ? result.id : null;

      const choices = result.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new SarvamLlmError("LLM response has no choices", "empty_response", requestId, true);
      }

      const content = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
      const contentStr = typeof content?.content === "string" ? content.content : null;

      if (!contentStr) {
        throw new SarvamLlmError("LLM response has no message content", "empty_content", requestId, true);
      }

      return parseSummaryContent(contentStr, requestId);
    },
  };
}
