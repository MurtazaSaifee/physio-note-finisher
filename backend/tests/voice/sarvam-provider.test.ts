import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "../../src/domain/voice/providers/providerErrors.js";
import type {
  SttProvider,
  ClinicalNoteProvider,
  PatientSummaryProvider,
} from "../../src/domain/voice/providers/providerTypes.js";
import { createSarvamSttProvider } from "../../src/domain/voice/providers/sarvamSttProvider.js";
import { createSarvamClinicalNoteProvider } from "../../src/domain/voice/providers/sarvamClinicalNoteProvider.js";
import { createSarvamPatientSummaryProvider } from "../../src/domain/voice/providers/sarvamPatientSummaryProvider.js";

const MOCK_API_KEY = "sarvam-test-key-123";

describe("providerTypes", () => {
  it("exports SttProvider, ClinicalNoteProvider, and PatientSummaryProvider", () => {
    // Type-level check: the imports above compile. Verify runtime shapes exist.
    const sttProvider = createSarvamSttProvider(MOCK_API_KEY);
    const clinicalProvider = createSarvamClinicalNoteProvider(MOCK_API_KEY);
    const summaryProvider = createSarvamPatientSummaryProvider(MOCK_API_KEY);

    expect(sttProvider).toBeDefined();
    expect(typeof sttProvider.transcribe).toBe("function");

    expect(clinicalProvider).toBeDefined();
    expect(typeof clinicalProvider.generateSoapDraft).toBe("function");

    expect(summaryProvider).toBeDefined();
    expect(typeof summaryProvider.generatePatientSummary).toBe("function");
  });
});

describe("SarvamClinicalNoteProvider", () => {
  let provider: ClinicalNoteProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = createSarvamClinicalNoteProvider(MOCK_API_KEY);
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1700000000,
          model: "sarvam-105b",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({ subjective: "test", objective: "test", assessment: "test", plan: "test" }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses sarvam-105b model with temperature between 0 and 0.2", async () => {
    await provider.generateSoapDraft({
      transcript: "Patient reports shoulder pain",
      patientDemographics: { age: 35, sex: "M" },
      priorNotes: [],
    });

    // Verify the fetch was called with sarvam-105b and appropriate temperature
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("https://api.sarvam.ai/v1/chat/completions");

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("sarvam-105b");
    expect(body.temperature).toBeGreaterThanOrEqual(0);
    expect(body.temperature).toBeLessThanOrEqual(0.2);
    expect(body.stream).toBe(false);
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "soap_note_draft",
        strict: true,
      },
    });
    expect(body.reasoning_effort).toBeNull();
    expect((init?.headers as Record<string, string>)["api-subscription-key"]).toBe(MOCK_API_KEY);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("honors configured model overrides in the SOAP request body", async () => {
    provider = createSarvamClinicalNoteProvider(MOCK_API_KEY, { model: "custom-soap-model" });

    await provider.generateSoapDraft({
      transcript: "Patient reports shoulder pain",
      patientDemographics: { age: 35, sex: "M" },
      priorNotes: [],
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("custom-soap-model");
  });
});

describe("SarvamPatientSummaryProvider", () => {
  let provider: PatientSummaryProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = createSarvamPatientSummaryProvider(MOCK_API_KEY);
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-summary-123",
          object: "chat.completion",
          created: 1700000000,
          model: "sarvam-105b",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  message: "You are improving well. Continue the prescribed exercises.",
                  safetyNote: null,
                  followUp: "Follow up next week if pain persists.",
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the preferred Sarvam API key header for patient summary generation", async () => {
    await provider.generatePatientSummary({
      validatedSoap: {
        subjective: "Pain improved.",
        objective: "Walking with less limp.",
        assessment: "Recovery is on track.",
        plan: "Continue exercises.",
      },
      patientLanguagePreference: "en-IN",
      clinicTonePreference: "Warm and encouraging",
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("https://api.sarvam.ai/v1/chat/completions");

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("sarvam-105b");
    expect(body.temperature).toBeGreaterThanOrEqual(0);
    expect(body.temperature).toBeLessThanOrEqual(0.2);
    expect(body.stream).toBe(false);
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "patient_summary_draft",
        strict: true,
      },
    });
    expect(body.reasoning_effort).toBeNull();
    expect((init?.headers as Record<string, string>)["api-subscription-key"]).toBe(MOCK_API_KEY);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("SarvamSttProvider", () => {
  let sttProvider: SttProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sttProvider = createSarvamSttProvider(MOCK_API_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the REST STT endpoint for short non-diarized recordings", async () => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: "req-rest-123",
          transcript: "Short recap transcript.",
          language_code: "en-IN",
          language_probability: null,
          timestamps: {
            words: ["Short recap", "transcript."],
            start_time_seconds: [0, 0.8],
            end_time_seconds: [0.7, 1.5],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sttProvider.transcribe(Buffer.from("mock-audio"), {
      languageCode: "en-IN",
      mode: "transcribe",
      audioDurationSeconds: 30,
    });

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(requestUrl).toBe("https://api.sarvam.ai/speech-to-text");
    expect((requestInit?.headers as Record<string, string>)["api-subscription-key"]).toBe(MOCK_API_KEY);

    const requestBody = requestInit?.body;
    expect(requestBody).toBeInstanceOf(FormData);
    const formData = requestBody as FormData;
    expect(formData.get("model")).toBe("saaras:v3");
    expect(formData.get("mode")).toBe("transcribe");
    expect(formData.get("language_code")).toBe("en-IN");
    expect(formData.get("with_timestamps")).toBe("true");
    const uploadedFile = formData.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("audio.m4a");
    expect((uploadedFile as File).type).toBe("audio/mp4");

    expect(result).toMatchObject({
      requestId: "req-rest-123",
      transcript: "Short recap transcript.",
      languageCode: "en-IN",
      languageProbability: null,
    });
    expect(result.segments).toEqual([
      {
        startTimeSeconds: 0,
        endTimeSeconds: 0.7,
        text: "Short recap",
      },
      {
        startTimeSeconds: 0.8,
        endTimeSeconds: 1.5,
        text: "transcript.",
      },
    ]);
  });

  it("uses the batch STT endpoint for long non-diarized recordings", async () => {
    let statusCalls = 0;
    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-abc-123",
            job_state: "Accepted",
            storage_container_type: "Azure",
            job_parameters: {},
          }),
          { status: 202 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/upload-files" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-abc-123",
            job_state: "Accepted",
            storage_container_type: "Azure",
            upload_urls: {
              "audio.m4a": {
                file_url: "https://upload.example/audio.m4a",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url === "https://upload.example/audio.m4a" && method === "PUT") {
        return new Response(null, { status: 201 });
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-abc-123/start" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-abc-123",
            job_state: "Pending",
            storage_container_type: "Azure",
          }),
          { status: 200 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-abc-123/status" && method === "GET") {
        statusCalls += 1;
        const payload = statusCalls === 1
          ? {
              job_id: "job-abc-123",
              job_state: "Running",
              storage_container_type: "Azure",
            }
          : {
              job_id: "job-abc-123",
              job_state: "Completed",
              storage_container_type: "Azure",
              job_details: [
                {
                  state: "Success",
                  inputs: [{ file_name: "audio.m4a", file_id: "input-0" }],
                  outputs: [{ file_name: "0.json", file_id: "output-0" }],
                  error_message: null,
                  exception_name: null,
                },
              ],
            };
        return new Response(
          JSON.stringify(payload),
          { status: 200 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/download-files" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-abc-123",
            job_state: "Completed",
            storage_container_type: "Azure",
            download_urls: {
              "0.json": {
                file_url: "https://download.example/0.json",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url === "https://download.example/0.json" && method === "GET") {
        return new Response(
          JSON.stringify({
            request_id: "req-xyz-456",
            transcript: "Hello, I have knee pain.",
            language_code: "en-IN",
            language_probability: 0.98,
            timestamps: {
              chunks: ["Hello,", "I have knee pain."],
              start_time_seconds: [0.01, 0.8],
              end_time_seconds: [0.5, 2.2],
            },
            diarized_transcript: {
              entries: [
                {
                  transcript: "Hello,",
                  start_time_seconds: 0.01,
                  end_time_seconds: 0.5,
                  speaker_id: "0",
                },
                {
                  transcript: "I have knee pain.",
                  start_time_seconds: 0.8,
                  end_time_seconds: 2.2,
                  speaker_id: "1",
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "not_found_error",
            message: `Unexpected ${method} ${url}`,
          },
        }),
        { status: 404 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const transcribePromise = sttProvider.transcribe(Buffer.from("mock-audio"), {
      languageCode: "en-IN",
      mode: "transcribe",
      audioDurationSeconds: 31,
    });

    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();
    const result = await transcribePromise;

    const [createUrl, createInit] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(createUrl).toBe("https://api.sarvam.ai/speech-to-text/job/v1");
    expect((createInit?.headers as Record<string, string>)["api-subscription-key"]).toBe(MOCK_API_KEY);

    const createBody = JSON.parse(createInit?.body as string);
    expect(createBody).toMatchObject({
      job_parameters: {
        model: "saaras:v3",
        mode: "transcribe",
        language_code: "en-IN",
        with_timestamps: true,
      },
    });

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/upload-files"))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/download-files"))).toBe(true);

    const uploadCall = fetchSpy.mock.calls.find(([url]) => String(url) === "https://upload.example/audio.m4a");
    expect(uploadCall).toBeDefined();
    expect((uploadCall?.[1]?.headers as Record<string, string>)["x-ms-blob-type"]).toBe("BlockBlob");
    expect((uploadCall?.[1]?.headers as Record<string, string>)["Content-Type"]).toBe("audio/mp4");

    expect(result.requestId).toBe("req-xyz-456");
    expect(result.transcript).toBe("Hello, I have knee pain.");
    expect(result.languageCode).toBe("en-IN");
    expect(result.languageProbability).toBe(0.98);
    expect(result.segments).toEqual([
      {
        startTimeSeconds: 0.01,
        endTimeSeconds: 0.5,
        text: "Hello,",
        speakerId: "0",
      },
      {
        startTimeSeconds: 0.8,
        endTimeSeconds: 2.2,
        text: "I have knee pain.",
        speakerId: "1",
      },
    ]);
  });

  it("accepts both chunk-based and word-keyed timestamp payloads from the docs", async () => {
    let statusCalls = 0;
    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-words-123",
            job_state: "Accepted",
            storage_container_type: "Azure",
            job_parameters: {},
          }),
          { status: 202 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/upload-files" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-words-123",
            job_state: "Accepted",
            storage_container_type: "Azure",
            upload_urls: {
              "audio.m4a": {
                file_url: "https://upload.example/audio.m4a",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url === "https://upload.example/audio.m4a" && method === "PUT") {
        return new Response(null, { status: 201 });
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-words-123/start" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-words-123",
            job_state: "Pending",
            storage_container_type: "Azure",
          }),
          { status: 200 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-words-123/status" && method === "GET") {
        statusCalls += 1;
        const payload = statusCalls === 1
          ? {
              job_id: "job-words-123",
              job_state: "Running",
              storage_container_type: "Azure",
            }
          : {
              job_id: "job-words-123",
              job_state: "Completed",
              storage_container_type: "Azure",
              job_details: [
                {
                  state: "Success",
                  inputs: [{ file_name: "audio.m4a", file_id: "input-0" }],
                  outputs: [{ file_name: "0.json", file_id: "output-0" }],
                },
              ],
            };
        return new Response(
          JSON.stringify(payload),
          { status: 200 },
        );
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/download-files" && method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-words-123",
            job_state: "Completed",
            storage_container_type: "Azure",
            download_urls: {
              "0.json": {
                file_url: "https://download.example/0.json",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url === "https://download.example/0.json" && method === "GET") {
        return new Response(
          JSON.stringify({
            request_id: "req-words-789",
            transcript: "Patient reports shoulder pain.",
            language_code: "en-IN",
            language_probability: 0.94,
            timestamps: {
              words: ["Patient reports", "shoulder pain."],
              start_time_seconds: [0.0, 1.2],
              end_time_seconds: [1.0, 2.6],
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "not_found_error",
            message: `Unexpected ${method} ${url}`,
          },
        }),
        { status: 404 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const transcribePromise = sttProvider.transcribe(Buffer.from("mock-audio"), {
      enableDiarization: true,
      numSpeakers: 2,
    });

    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    const result = await transcribePromise;
    expect(result.segments).toEqual([
      {
        startTimeSeconds: 0,
        endTimeSeconds: 1,
        text: "Patient reports",
      },
      {
        startTimeSeconds: 1.2,
        endTimeSeconds: 2.6,
        text: "shoulder pain.",
      },
    ]);
  });

  it("fails batch jobs that complete with failed files instead of downloading phantom outputs", async () => {
    const providerText = "Patient Karan Rao has a lumbar disc injury; token=provider-secret-456";
    const exceptionText = "Patient Karan Rao exception; api_key=provider-secret-789";
    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1" && method === "POST") {
        return new Response(JSON.stringify({ job_id: "job-failed-123" }), { status: 202 });
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/upload-files" && method === "POST") {
        return new Response(
          JSON.stringify({
            upload_urls: {
              "audio.m4a": {
                file_url: "https://upload.example/audio.m4a",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url === "https://upload.example/audio.m4a" && method === "PUT") {
        return new Response(null, { status: 201 });
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-failed-123/start" && method === "POST") {
        return new Response(JSON.stringify({ job_id: "job-failed-123", job_state: "Pending" }), { status: 200 });
      }

      if (url === "https://api.sarvam.ai/speech-to-text/job/v1/job-failed-123/status" && method === "GET") {
        return new Response(
          JSON.stringify({
            job_id: "job-failed-123",
            job_state: "Completed",
            request_id: "req-failed-123",
            successful_files_count: 0,
            failed_files_count: 1,
            error_message: providerText,
            job_details: [
              {
                state: "API Error",
                inputs: [{ file_name: "audio.m4a", file_id: "input-0" }],
                outputs: [],
                error_message: providerText,
                exception_name: exceptionText,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "not_found_error",
            message: `Unexpected ${method} ${url}`,
          },
        }),
        { status: 404 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const transcribePromise = sttProvider.transcribe(Buffer.from("mock-audio"), {
      enableDiarization: true,
    });
    const rejectionExpectation = expect(transcribePromise).rejects.toMatchObject({
      name: "SarvamSttError",
      code: "job_failed",
      requestId: "req-failed-123",
      isRetryable: false,
      message: "Sarvam STT job failed",
    });

    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    await rejectionExpectation;
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/download-files"))).toBe(false);
  });

  it("uses safe HTTP failure codes without exposing nested Sarvam error text", async () => {
    const providerText = "job_parameters contains Patient Anika Singh clinical details";
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "invalid_request_error",
            message: providerText,
            request_id: "req-create-123",
          },
        }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      sttProvider.transcribe(Buffer.from("mock-audio"), { enableDiarization: true }),
    ).rejects.toMatchObject({
      name: "SarvamSttError",
      code: "http_400",
      requestId: "req-create-123",
      isRetryable: false,
      message: "Sarvam STT job creation failed (400)",
    });
  });
});

describe("providerErrors", () => {
  it("ProviderError exposes retryable and providerRequestId", () => {
    const error = new ProviderError(
      "Rate limit exceeded",
      "rate_limited",
      "req-abc-123",
      true,
    );

    expect(error.isRetryable).toBe(true);
    expect(error.requestId).toBe("req-abc-123");
    expect(error.code).toBe("rate_limited");
    expect(error.name).toBe("ProviderError");

    // Error message for logging includes detail
    expect(error.message).toContain("Rate limit exceeded");
  });

  it("non-retryable errors expose false for retryable", () => {
    const error = new ProviderError(
      "Invalid API key",
      "invalid_api_key",
      null,
      false,
    );

    expect(error.isRetryable).toBe(false);
    expect(error.requestId).toBeNull();
  });

  it("route-safe message does not expose raw provider payloads", () => {
    // Provider error message is the developer-friendly message, not raw JSON
    const error = new ProviderError(
      "Sarvam API returned 500",
      "internal_error",
      "req-safe-789",
      true,
    );

    // The message is human-readable, not raw JSON blob
    expect(error.message).not.toContain("{");
    expect(error.message).not.toContain("<html");
    expect(error.message).toContain("Sarvam");

    // requestId is safe to expose
    expect(error.requestId).toBe("req-safe-789");
  });
});
