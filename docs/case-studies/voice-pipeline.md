# Case study: a consented, staged voice-to-note pipeline

**Problem.** A physio finishes a visit and has a minute, not ten, to write the note.
Speaking a recap is fast, but audio is sensitive, transcription can fail halfway,
and a phone on clinic Wi-Fi will retry requests.

**Design.**

```text
record (Expo Audio, AAC)
  → POST /voice/consents             consent recorded per patient
  → POST /voice/uploads              refused without active consent
  → PUT  audio                       API path locally, presigned S3 URL in cloud
  → POST /voice/uploads/:id/complete idempotent: a retried complete returns the same job
      stage: transcription           maxAttempts 3, retry endpoint, status per stage
  → clinician reviews/edits transcript
  → POST /voice/soap/generate        SOAP sections, validated before they're stored
  → POST /voice/summary/generate     plain-language patient summary
```

- **One contract, two transports.** Locally the stage queue runs inline in the API
  process. In the cloud the same stages go to SQS and a separate worker process
  ([`server.ts`](../../backend/src/server.ts),
  [`voiceWorker.ts`](../../backend/src/workers/voiceWorker.ts),
  [`sqsPollerCore.ts`](../../backend/src/workers/sqsPollerCore.ts)).
- **Providers behind an interface.** Sarvam (Saaras STT + an LLM) in production,
  deterministic demo providers when no key is set, so reviewers and CI run the whole
  flow offline
  ([`providerRegistry.ts`](../../backend/src/domain/voice/providers/providerRegistry.ts),
  [`localVoiceProviders.ts`](../../backend/src/domain/voice/providers/localVoiceProviders.ts)).
- **Untrusted model output.** Provider responses are parsed with Zod before
  anything is persisted; malformed drafts fail the stage instead of saving garbage
  ([`sarvamClinicalNoteProvider.ts`](../../backend/src/domain/voice/providers/sarvamClinicalNoteProvider.ts)).
- **Retention.** Recordings follow the clinician's retention policy (30 days by
  default) and are deleted by a scheduler.

**Tests.** Consent gate, upload-complete idempotency, stage retries, presigned flow,
SQS poller and provider redaction are covered in
[`backend/tests/voice`](../../backend/tests/voice). The Maestro flow
`voice-note.yml` drives the same path on an emulator.
