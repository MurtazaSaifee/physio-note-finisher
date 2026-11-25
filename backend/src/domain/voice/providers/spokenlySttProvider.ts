import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type {
  SttProvider,
  TranscriptSegment,
  TranscriptionResult,
} from "./providerTypes.js";
import { ProviderError } from "./providerErrors.js";

const execFileAsync = promisify(execFile);

type SpokenlySegment = {
  start?: number;
  end?: number;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  text?: string;
  speakerId?: string;
};

type SpokenlyJson = {
  requestId?: string;
  modelId?: string;
  languageCode?: string;
  languageProbability?: number;
  text?: string;
  transcript?: string;
  segments?: SpokenlySegment[];
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSegment(
  segment: SpokenlySegment,
): TranscriptSegment | null {
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (!text) {
    return null;
  }

  const startTimeSeconds = isNumber(segment.start)
    ? segment.start
    : isNumber(segment.startTimeSeconds)
      ? segment.startTimeSeconds
      : 0;
  const endTimeSeconds = isNumber(segment.end)
    ? segment.end
    : isNumber(segment.endTimeSeconds)
      ? segment.endTimeSeconds
      : startTimeSeconds;

  return {
    startTimeSeconds,
    endTimeSeconds,
    text,
    ...(typeof segment.speakerId === "string" && segment.speakerId.trim()
      ? { speakerId: segment.speakerId }
      : {}),
  };
}

function parseSpokenlyOutput(
  stdout: string,
  audioBufferLength: number,
): TranscriptionResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Spokenly CLI returned empty output");
  }

  let parsed: SpokenlyJson;
  try {
    parsed = JSON.parse(trimmed) as SpokenlyJson;
  } catch {
    throw new Error("Spokenly CLI returned invalid JSON");
  }

  const segments = Array.isArray(parsed.segments)
    ? parsed.segments.map(normalizeSegment).filter((segment): segment is TranscriptSegment => Boolean(segment))
    : [];

  const transcript =
    (typeof parsed.text === "string" && parsed.text.trim()) ||
    (typeof parsed.transcript === "string" && parsed.transcript.trim()) ||
    segments.map((segment) => segment.text).join(" ").trim();

  if (!transcript) {
    throw new Error("Spokenly CLI returned no transcript text");
  }

  const effectiveSegments =
    segments.length > 0
      ? segments
      : [
          {
            startTimeSeconds: 0,
            endTimeSeconds: Math.max(1, Math.round(audioBufferLength / 1000)),
            text: transcript,
          },
        ];

  return {
    requestId: typeof parsed.requestId === "string" ? parsed.requestId : null,
    transcript,
    languageCode: typeof parsed.languageCode === "string" ? parsed.languageCode : null,
    languageProbability: isNumber(parsed.languageProbability)
      ? parsed.languageProbability
      : null,
    segments: effectiveSegments,
  };
}

function toSafeErrorMessage(raw: string): string {
  const message = raw.trim();
  if (!message) {
    return "Spokenly CLI returned empty output";
  }
  return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}

export function isSpokenlyCliMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export function createSpokenlySttProvider(command = "spokenly"): SttProvider {
  return {
    async transcribe(audioBuffer) {
      const tempDir = await mkdtemp(join(tmpdir(), "physio-spokenly-"));
      const audioPath = join(tempDir, "audio.m4a");

      try {
        await writeFile(audioPath, audioBuffer);

        try {
          const { stdout, stderr } = await execFileAsync(
            command,
            ["transcribe", audioPath, "--format", "json"],
            {
              // Pass env explicitly: newer Node versions read the real process
              // environment otherwise, ignoring a reassigned process.env.
              env: process.env,
              maxBuffer: 10 * 1024 * 1024,
              timeout: 60_000,
            },
          );

          const stdoutText = String(stdout ?? "");
          const stderrText = String(stderr ?? "");
          if (!stdoutText.trim() && stderrText.trim()) {
            throw new ProviderError(
              `Spokenly transcription failed: ${toSafeErrorMessage(stderrText)}`,
              "spokenly_cli_stderr",
              null,
              false,
            );
          }

          try {
            return parseSpokenlyOutput(stdoutText, audioBuffer.length);
          } catch (error) {
            throw new ProviderError(
              error instanceof Error ? error.message : "Spokenly CLI returned invalid output",
              "spokenly_cli_output_invalid",
              null,
              false,
            );
          }
        } catch (error) {
          if (isSpokenlyCliMissing(error)) {
            throw error;
          }
          if (error instanceof ProviderError) {
            throw error;
          }

          const stderrText =
            typeof error === "object" && error !== null && "stderr" in error
              ? String((error as { stderr?: unknown }).stderr ?? "")
              : "";
          const codeText =
            typeof error === "object" && error !== null && "code" in error
              ? String((error as { code?: unknown }).code ?? "")
              : "";
          const detail = toSafeErrorMessage(stderrText || codeText || String(error));
          throw new ProviderError(
            `Spokenly transcription failed: ${detail}`,
            "spokenly_cli_exec_failed",
            null,
            true,
          );
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}
