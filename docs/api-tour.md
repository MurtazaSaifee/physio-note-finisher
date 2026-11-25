# API tour (no Android needed)

This walks one complete clinical visit through the real API: sign in, open a
session, record consent, upload a voice recap, get a transcript, draft a SOAP note
and a patient summary, finalize, and export a PDF. It needs only Docker, `curl` and
`jq`, and no API keys.

## Start the API

```bash
docker compose up --build -d --wait
```

This starts Postgres and the API on `http://localhost:3000`, applies the
migrations, and seeds a demo clinic with six synthetic patients. With no
`SARVAM_API_KEY`, the API uses its offline demo providers: any uploaded audio
produces the same physio recap, and the SOAP and summary drafts are deterministic.

If you already ran `npm run setup`, `npm run dev` gives you the same API without
the `api` container.

## Run it

```bash
npm run api:tour        # or: bash scripts/api-tour.sh
```

Real output from a fresh `docker compose up`:

```text
== 1. Sign in (access + rotating refresh token)
signed in to clinic_demo_01

== 2. Pick a seeded patient
patient demo-pt-ananya

== 3. Open a draft session
session cmwvzz1b1000c3ro2nm4gyec9

== 4. Record AI-processing consent (audio is refused without it)
{"type":"recording_ai_processing","status":"active","consentTextVersion":"v1-2026"}

== 5. Upload a voice recap: start → send bytes → complete
stored at clinics/clinic_demo_01/voice-uploads/b7aaf95d-…/audio.m4a
voice job 714a40c6-8cc6-488b-a0cb-368046e8c77d

== 6. Wait for transcription
job succeeded
transcript: Follow-up for the left ACL reconstruction, now about eight weeks post-op. …

== 7. Draft the SOAP note from the transcript
{
  "subjective": "Left knee pain 2/10 at rest, 4/10 after stairs, ~8 weeks after ACL reconstruction. …",
  "objective": "Knee flexion 120°, full extension. Small effusion. Mild dynamic valgus on single-leg squat. …",
  "assessment": "Progressing as expected for this stage post-ACL reconstruction. …",
  "plan": "Progress closed-chain strengthening; add stationary bike intervals and single-leg balance work. …"
}

== 8. Draft the patient-friendly summary
Your knee is healing well. Keep doing your exercises every day, add the exercise bike and balance work, …

== 9. Finalize (locked until deliberately reopened)
{"noteStatus":"finalized"}

== 10. Export the full note as a PDF
saved ./physio-note-export.pdf (2556 bytes)

== 11. Tenant isolation: a path that escapes this clinic is refused
GET …/clinics/clinic_demo_01/../another-clinic/note.pdf → HTTP 403
```

## What each step shows

| Step | Endpoint | What to notice |
| --- | --- | --- |
| 1 | `POST /api/v1/auth/login` | Short-lived access token plus a refresh token that rotates on every use. Replaying an already-rotated refresh token revokes all of that user's sessions. |
| 2–3 | `GET /api/v1/patients`, `POST /api/v1/patients/:id/sessions` | Every request carries `x-clinic-id`. A caller can never name a clinic other than the one in their token. |
| 4 | `POST /api/v1/voice/consents` | Audio upload, transcription and every AI draft check for active patient consent first. |
| 5 | `POST /voice/uploads` → `PUT …/binary` → `POST …/complete` | Locally the bytes go to the API. In the cloud the same contract returns an S3 presigned URL instead. |
| 6 | `GET /api/v1/voice/jobs/:id` | Transcription is a staged, idempotent job: run inline locally, by an SQS worker in the cloud. |
| 7–8 | `POST /api/v1/voice/soap/generate`, `…/summary/generate` | Drafts only. The clinician edits them before finalizing. |
| 9 | `POST …/note/finalize` | Finalized notes reject ordinary edits; reopening is a separate, audited action. |
| 10 | `POST …/export-records` → `POST …/download` | PDF rendering runs as a background job; the download URL is short-lived and clinic-scoped. |
| 11 | `GET /api/v1/storage/download/:key` | Storage keys are normalized and resolved before the clinic prefix is checked, so `..` can't reach another clinic. |

## Clean up

```bash
docker compose down        # keep the data
docker compose down -v     # remove the database volume too
```
