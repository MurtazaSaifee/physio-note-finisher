import { z } from "zod";

import type { ClinicalNoteProvider, GenerateSoapInput, SoapNoteDraft } from "./providerTypes.js";
import { SarvamLlmError, isRetryableHttpStatus, buildRouteSafeErrorMessage } from "./providerErrors.js";
import { buildSarvamHeaders, parseSarvamApiErrorDetails } from "./sarvamApi.js";
import { buildSoapSystemPrompt, buildSoapUserPrompt } from "../prompts/soapPrompt.js";

const SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions";

const SARVAM_MODEL = "sarvam-30b";
const SARVAM_TEMPERATURE = 0.2;

const soapNoteDraftSchema = z.object({
  subjective: z.string().max(8000),
  objective: z.string().max(8000),
  assessment: z.string().max(8000),
  plan: z.string().max(8000),
  metadata: z.object({
    language: z.string().max(80).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    missingInformation: z.array(z.string().max(500)).max(50).optional(),
    requiresClinicianReview: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const soapResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "soap_note_draft",
    description: "Structured SOAP note draft for physiotherapy clinician review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["subjective", "objective", "assessment", "plan"],
      properties: {
        subjective: { type: "string" },
        objective: { type: "string" },
        assessment: { type: "string" },
        plan: { type: "string" },
        metadata: {
          type: "object",
          additionalProperties: false,
          properties: {
            language: { type: "string" },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            missingInformation: {
              type: "array",
              items: { type: "string" },
            },
            requiresClinicianReview: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;

type SarvamClinicalNoteProviderOptions = {
  model?: string;
  temperature?: number;
};

function parseSoapContent(raw: unknown, requestId: string | null): SoapNoteDraft {
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

  const validated = soapNoteDraftSchema.safeParse(parsed);
  if (!validated.success) {
    throw new SarvamLlmError(
      `LLM JSON failed schema validation: ${validated.error.message}`,
      "invalid_json_shape",
      requestId,
      true,
    );
  }

  const { subjective, objective, assessment, plan, metadata } = validated.data;

  return {
    subjective,
    objective,
    assessment,
    plan,
    ...(metadata
      ? {
          metadata: {
            ...(metadata.language ? { language: metadata.language } : {}),
            ...(metadata.confidence ? { confidence: metadata.confidence } : {}),
            ...(metadata.missingInformation ? { missingInformation: metadata.missingInformation } : {}),
            ...(metadata.requiresClinicianReview !== undefined
              ? { requiresClinicianReview: metadata.requiresClinicianReview }
              : {}),
          },
        }
      : {}),
  };
}

export function createSarvamClinicalNoteProvider(
  apiKey: string,
  options: SarvamClinicalNoteProviderOptions = {},
): ClinicalNoteProvider {
  const model = options.model ?? SARVAM_MODEL;
  const temperature = options.temperature ?? SARVAM_TEMPERATURE;

  return {
    async generateSoapDraft(input: GenerateSoapInput): Promise<SoapNoteDraft> {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSoapSystemPrompt() },
          { role: "user", content: buildSoapUserPrompt(input) },
        ],
        reasoning_effort: null,
        response_format: soapResponseFormat,
        temperature,
        top_p: 1.0,
        max_tokens: 2048,
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
          "Sarvam clinical note request failed",
          "network_error",
          null,
          true,
        );
      }

      if (!response.ok) {
        const errorDetails = await parseSarvamApiErrorDetails(response);
        throw new SarvamLlmError(
          `Sarvam clinical note request failed (${response.status})`,
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

      return parseSoapContent(contentStr, requestId);
    },
  };
}

export { buildRouteSafeErrorMessage };
