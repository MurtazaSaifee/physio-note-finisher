import type {
  SttLanguageCode,
  SttMode,
  SttProvider,
  SttTranscribeOptions,
  TranscriptionResult,
  TranscriptSegment,
} from "./providerTypes.js";
import { SarvamSttError, isRetryableHttpStatus } from "./providerErrors.js";
import {
  assertSafeProviderFileUrl,
  buildSarvamHeaders,
  parseSarvamApiErrorDetails,
} from "./sarvamApi.js";

const SARVAM_STT_BASE = "https://api.sarvam.ai";
const SARVAM_STT_REST_URL = `${SARVAM_STT_BASE}/speech-to-text`;
const SARVAM_STT_JOB_URL = `${SARVAM_STT_BASE}/speech-to-text/job/v1`;
const SARVAM_STT_UPLOAD_URL = `${SARVAM_STT_BASE}/speech-to-text/job/v1/upload-files`;
const SARVAM_STT_DOWNLOAD_URL = `${SARVAM_STT_BASE}/speech-to-text/job/v1/download-files`;

const SARVAM_STT_MODEL = "saaras:v3";
const DEFAULT_MODE: SttMode = "codemix";
const DEFAULT_LANGUAGE: SttLanguageCode = "unknown";
const DEFAULT_FILE_NAME = "audio.m4a";
const DEFAULT_CONTENT_TYPE = "audio/mp4";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max
const MAX_TRANSCRIPT_CHARS = 200_000;
const MAX_TRANSCRIPT_SEGMENTS = 10_000;

interface SarvamSttJobCreateResponse {
  job_id: string;
  job_state?: string;
}

interface SarvamSttUploadResponse {
  upload_urls?: Record<string, { file_url?: string }>;
}

interface SarvamSttFileDescriptor {
  file_name?: string;
  file_id?: string;
}

interface SarvamSttJobDetail {
  inputs?: SarvamSttFileDescriptor[];
  outputs?: SarvamSttFileDescriptor[];
  state?: string;
  error_message?: string | null;
  exception_name?: string | null;
}

interface SarvamSttJobStatusResponse {
  job_id: string;
  job_state?: string;
  request_id?: string;
  error_message?: string | null;
  successful_files_count?: number;
  failed_files_count?: number;
  job_details?: SarvamSttJobDetail[];
}

interface SarvamSttDownloadUrlResponse {
  download_urls?: Record<string, { file_url?: string }>;
}

interface SarvamSttDownloadResponse {
  request_id?: string;
  transcript: string;
  language_code?: string;
  language_probability?: number | null;
  timestamps?: {
    chunks?: string[];
    words?: string[];
    start_time_seconds?: number[];
    end_time_seconds?: number[];
  };
  diarized_transcript?: {
    entries?: Array<{
      transcript: string;
      start_time_seconds: number;
      end_time_seconds: number;
      speaker_id: string;
    }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeJobState(state: string | undefined): string {
  return state?.trim().toLowerCase() ?? "";
}

function isSuccessfulJobState(state: string | undefined): boolean {
  const normalized = normalizeJobState(state);
  return normalized === "completed" || normalized === "partiallycompleted";
}

function isFailedJobState(state: string | undefined): boolean {
  const normalized = normalizeJobState(state);
  return normalized === "failed" || normalized === "cancelled" || normalized === "error";
}

function shouldUseBatchApi(options: SttTranscribeOptions): boolean {
  return options.enableDiarization === true || (options.audioDurationSeconds ?? 0) > 30;
}

function extractOutputFileNames(statusResult: SarvamSttJobStatusResponse): string[] {
  const outputFiles = statusResult.job_details
    ?.flatMap((detail) => detail.outputs ?? [])
    .map((file) => file.file_name)
    .filter((fileName): fileName is string => typeof fileName === "string" && fileName.trim().length > 0) ?? [];

  return [...new Set(outputFiles)];
}

function hasFailedBatchOutputs(statusResult: SarvamSttJobStatusResponse): boolean {
  if ((statusResult.failed_files_count ?? 0) > 0) {
    return true;
  }

  return statusResult.job_details?.some((detail) => {
    const detailState = normalizeJobState(detail.state);
    if (!detailState) {
      return Boolean(detail.error_message ?? detail.exception_name);
    }

    return detailState !== "success" && detailState !== "completed";
  }) ?? false;
}

function buildSegments(downloadResult: SarvamSttDownloadResponse): TranscriptSegment[] {
  const diarizedEntries = downloadResult.diarized_transcript?.entries ?? [];
  if (diarizedEntries.length > 0) {
    return diarizedEntries.map((entry) => ({
      startTimeSeconds: entry.start_time_seconds,
      endTimeSeconds: entry.end_time_seconds,
      text: entry.transcript,
      speakerId: entry.speaker_id,
    }));
  }

  const timestamps = downloadResult.timestamps;
  if (!timestamps) {
    return [];
  }

  const tokens = timestamps.chunks ?? timestamps.words ?? [];
  const startTimes = timestamps.start_time_seconds ?? [];
  const endTimes = timestamps.end_time_seconds ?? [];

  return tokens.map((text, index) => ({
    startTimeSeconds: startTimes[index] ?? 0,
    endTimeSeconds: endTimes[index] ?? 0,
    text,
  }));
}

function buildJobFailureMessage(): string {
  // Batch error fields are provider-controlled and can contain clinical text.
  // Keep the persisted and logged failure safe for clinicians and operations.
  return "Sarvam STT job failed";
}

function buildRestRequestBody(
  audioBuffer: Buffer,
  model: string,
  options: SttTranscribeOptions,
): FormData {
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([audioBuffer], { type: DEFAULT_CONTENT_TYPE }),
    DEFAULT_FILE_NAME,
  );
  formData.append("model", model);
  formData.append("mode", options.mode ?? DEFAULT_MODE);
  if (options.languageCode && options.languageCode !== DEFAULT_LANGUAGE) {
    formData.append("language_code", options.languageCode);
  }
  formData.append("with_timestamps", "true");

  return formData;
}

function mapTranscriptionResult(
  result: SarvamSttDownloadResponse,
  fallbackRequestId: string | null,
): TranscriptionResult {
  return {
    requestId: result.request_id ?? fallbackRequestId,
    transcript: result.transcript,
    languageCode: result.language_code ?? null,
    languageProbability: result.language_probability ?? null,
    segments: buildSegments(result),
    diarizedEntries: result.diarized_transcript?.entries?.map((entry) => ({
      transcript: entry.transcript,
      startTimeSeconds: entry.start_time_seconds,
      endTimeSeconds: entry.end_time_seconds,
      speakerId: entry.speaker_id,
    })),
  };
}

function validateTranscriptionResult(result: SarvamSttDownloadResponse): void {
  if (
    typeof result.transcript !== "string" ||
    result.transcript.length > MAX_TRANSCRIPT_CHARS ||
    (result.diarized_transcript?.entries?.length ?? 0) > MAX_TRANSCRIPT_SEGMENTS ||
    (result.timestamps?.chunks?.length ?? 0) > MAX_TRANSCRIPT_SEGMENTS ||
    (result.timestamps?.words?.length ?? 0) > MAX_TRANSCRIPT_SEGMENTS
  ) {
    throw new SarvamSttError(
      "Sarvam STT returned an invalid response",
      "invalid_response",
      typeof result.request_id === "string" ? result.request_id : null,
      false,
    );
  }

  const invalidDiarizedEntry = result.diarized_transcript?.entries?.some(
    (entry) =>
      typeof entry.transcript !== "string" ||
      entry.transcript.length > MAX_TRANSCRIPT_CHARS,
  );
  if (invalidDiarizedEntry) {
    throw new SarvamSttError(
      "Sarvam STT returned an invalid response",
      "invalid_response",
      typeof result.request_id === "string" ? result.request_id : null,
      false,
    );
  }
}

type SarvamSttProviderOptions = {
  model?: string;
};

async function transcribeWithRestApi(
  apiKey: string,
  model: string,
  audioBuffer: Buffer,
  options: SttTranscribeOptions,
): Promise<TranscriptionResult> {
  let response: Response;
  try {
    response = await fetch(SARVAM_STT_REST_URL, {
      method: "POST",
      redirect: "error",
      headers: buildSarvamHeaders(apiKey),
      body: buildRestRequestBody(audioBuffer, model, options),
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT request failed",
      "network_error",
      null,
      true,
    );
  }

  if (!response.ok) {
    const errorDetails = await parseSarvamApiErrorDetails(response);
    throw new SarvamSttError(
      `Sarvam STT request failed (${response.status})`,
      errorDetails.code,
      errorDetails.requestId,
      isRetryableHttpStatus(response.status),
    );
  }

  const result = await response.json() as SarvamSttDownloadResponse;
  validateTranscriptionResult(result);
  return mapTranscriptionResult(result, result.request_id ?? null);
}

async function transcribeWithBatchApi(
  apiKey: string,
  model: string,
  audioBuffer: Buffer,
  options: SttTranscribeOptions,
): Promise<TranscriptionResult> {
  const languageCode = options.languageCode ?? DEFAULT_LANGUAGE;
  const mode = options.mode ?? DEFAULT_MODE;

  const createBody = JSON.stringify({
    job_parameters: {
      model,
      mode,
      language_code: languageCode,
      with_timestamps: true,
      ...(options.enableDiarization
        ? {
            with_diarization: true,
            num_speakers: options.numSpeakers ?? 2,
          }
        : {}),
    },
  });

  let response: Response;
  try {
    response = await fetch(SARVAM_STT_JOB_URL, {
      method: "POST",
      redirect: "error",
      headers: buildSarvamHeaders(apiKey, {
        "Content-Type": "application/json",
      }),
      body: createBody,
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT request failed",
      "network_error",
      null,
      true,
    );
  }

  if (!response.ok) {
    const errorDetails = await parseSarvamApiErrorDetails(response);
    throw new SarvamSttError(
      `Sarvam STT job creation failed (${response.status})`,
      errorDetails.code,
      errorDetails.requestId,
      isRetryableHttpStatus(response.status),
    );
  }

  const createResult = await response.json() as SarvamSttJobCreateResponse;
  const jobId = createResult.job_id;
  if (!jobId) {
    throw new SarvamSttError("Sarvam STT job creation returned no job ID", "invalid_response", null, true);
  }

  try {
    response = await fetch(SARVAM_STT_UPLOAD_URL, {
      method: "POST",
      redirect: "error",
      headers: buildSarvamHeaders(apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        job_id: jobId,
        files: [DEFAULT_FILE_NAME],
      }),
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT upload URL request failed",
      "network_error",
      jobId,
      true,
    );
  }

  if (!response.ok) {
    const errorDetails = await parseSarvamApiErrorDetails(response);
    throw new SarvamSttError(
      `Sarvam STT upload URL request failed (${response.status})`,
      errorDetails.code,
      errorDetails.requestId ?? jobId,
      isRetryableHttpStatus(response.status),
    );
  }

  const uploadResult = await response.json() as SarvamSttUploadResponse;
  const uploadUrl = uploadResult.upload_urls?.[DEFAULT_FILE_NAME]?.file_url;
  if (!uploadUrl) {
    throw new SarvamSttError(
      "Sarvam STT upload URL response missing file URL",
      "invalid_upload_url_response",
      jobId,
      true,
    );
  }

  try {
    response = await fetch(assertSafeProviderFileUrl(uploadUrl), {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": DEFAULT_CONTENT_TYPE,
      },
      body: audioBuffer,
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT upload failed",
      "network_error",
      jobId,
      true,
    );
  }

  if (!response.ok) {
    throw new SarvamSttError(
      `Sarvam STT upload error (${response.status})`,
      `upload_http_${response.status}`,
      jobId,
      isRetryableHttpStatus(response.status),
    );
  }

  try {
    response = await fetch(`${SARVAM_STT_JOB_URL}/${jobId}/start`, {
      method: "POST",
      redirect: "error",
      headers: buildSarvamHeaders(apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({}),
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT start failed",
      "network_error",
      jobId,
      true,
    );
  }

  if (!response.ok) {
    const errorDetails = await parseSarvamApiErrorDetails(response);
    throw new SarvamSttError(
      `Sarvam STT start error (${response.status})`,
      errorDetails.code,
      errorDetails.requestId ?? jobId,
      isRetryableHttpStatus(response.status),
    );
  }

  let statusResult: SarvamSttJobStatusResponse | null = null;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);

    try {
      response = await fetch(`${SARVAM_STT_JOB_URL}/${jobId}/status`, {
        method: "GET",
        redirect: "error",
        headers: buildSarvamHeaders(apiKey),
      });
    } catch (err) {
      throw new SarvamSttError(
        "Sarvam STT status request failed",
        "network_error",
        jobId,
        true,
      );
    }

    if (!response.ok) {
      const errorDetails = await parseSarvamApiErrorDetails(response);
      throw new SarvamSttError(
        `Sarvam STT status error (${response.status})`,
        errorDetails.code,
        errorDetails.requestId ?? jobId,
        isRetryableHttpStatus(response.status),
      );
    }

    statusResult = await response.json() as SarvamSttJobStatusResponse;

    if (isSuccessfulJobState(statusResult.job_state)) {
      break;
    }

    if (isFailedJobState(statusResult.job_state)) {
      throw new SarvamSttError(
        buildJobFailureMessage(),
        "job_failed",
        statusResult.request_id ?? jobId,
        false,
      );
    }
  }

  if (!statusResult || !isSuccessfulJobState(statusResult.job_state)) {
    throw new SarvamSttError(
      "Sarvam STT job timed out waiting for completion",
      "timeout",
      jobId,
      true,
    );
  }

  if (hasFailedBatchOutputs(statusResult)) {
    throw new SarvamSttError(
      buildJobFailureMessage(),
      "job_failed",
      statusResult.request_id ?? jobId,
      false,
    );
  }

  const outputFiles = extractOutputFileNames(statusResult);
  if (outputFiles.length === 0) {
    throw new SarvamSttError(
      "Sarvam STT completed without any downloadable transcript files",
      "missing_output_files",
      statusResult.request_id ?? jobId,
      true,
    );
  }

  try {
    response = await fetch(SARVAM_STT_DOWNLOAD_URL, {
      method: "POST",
      redirect: "error",
      headers: buildSarvamHeaders(apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        job_id: jobId,
        files: outputFiles,
      }),
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT download URL request failed",
      "network_error",
      jobId,
      true,
    );
  }

  if (!response.ok) {
    const errorDetails = await parseSarvamApiErrorDetails(response);
    throw new SarvamSttError(
      `Sarvam STT download URL request failed (${response.status})`,
      errorDetails.code,
      errorDetails.requestId ?? jobId,
      isRetryableHttpStatus(response.status),
    );
  }

  const downloadUrlResult = await response.json() as SarvamSttDownloadUrlResponse;
  const primaryOutputFile = outputFiles[0];
  if (!primaryOutputFile) {
    throw new SarvamSttError(
      "Sarvam STT completed without a primary output file",
      "missing_output_files",
      statusResult.request_id ?? jobId,
      true,
    );
  }

  const downloadUrl = downloadUrlResult.download_urls?.[primaryOutputFile]?.file_url;
  if (!downloadUrl) {
    throw new SarvamSttError(
      "Sarvam STT download URL response missing file URL",
      "invalid_download_url_response",
      statusResult.request_id ?? jobId,
      true,
    );
  }

  try {
    response = await fetch(assertSafeProviderFileUrl(downloadUrl), {
      method: "GET",
    });
  } catch (err) {
    throw new SarvamSttError(
      "Sarvam STT download failed",
      "network_error",
      jobId,
      true,
    );
  }

  if (!response.ok) {
    throw new SarvamSttError(
      `Sarvam STT download error (${response.status})`,
      `download_http_${response.status}`,
      jobId,
      isRetryableHttpStatus(response.status),
    );
  }

  const downloadResult = await response.json() as SarvamSttDownloadResponse;
  validateTranscriptionResult(downloadResult);
  return mapTranscriptionResult(downloadResult, statusResult.request_id ?? jobId);
}

export function createSarvamSttProvider(
  apiKey: string,
  options: SarvamSttProviderOptions = {},
): SttProvider {
  const model = options.model ?? SARVAM_STT_MODEL;

  return {
    async transcribe(
      audioBuffer: Buffer,
      transcribeOptions: SttTranscribeOptions = {},
    ): Promise<TranscriptionResult> {
      if (shouldUseBatchApi(transcribeOptions)) {
        return transcribeWithBatchApi(apiKey, model, audioBuffer, transcribeOptions);
      }

      return transcribeWithRestApi(apiKey, model, audioBuffer, transcribeOptions);
    },
  };
}
