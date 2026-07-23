# Case study: consented voice-to-note pipeline

The Android client records AAC/M4A audio with Expo Audio. It requests an authenticated upload session, sends the binary recording to a clinic-scoped Fastify route, and completes the upload. The backend stores the file locally and starts the in-process transcription pipeline.

Before upload or AI generation, the backend verifies an active patient consent record. Sarvam is then used for speech-to-text and structured SOAP/patient-summary drafts. Provider responses are validated before persistence, and the resulting content remains editable.

If `SARVAM_API_KEY` is missing, AI routes return `503 sarvam_not_configured`. Manual note creation remains available. Recordings are subject to the locally configured retention policy.
