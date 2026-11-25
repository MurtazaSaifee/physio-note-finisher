# Security

This is a portfolio repository, not a hosted clinical service. Use synthetic data
only. Never put real patient information, recordings, credentials or tokens in
issues, pull requests, fixtures or local configuration.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting (**Security → Report a
vulnerability** on this repository) instead of a public issue. Include the affected
route or file, the impact, and steps to reproduce.

## What is in place

- Separate access and refresh secrets; HS256 pinned on verification; bcrypt
  password hashes.
- Refresh tokens rotate on every use and are stored hashed. Replaying a rotated
  token revokes the user's sessions.
- Every request is scoped to the caller's clinic. Storage keys are normalized
  before the clinic-prefix check, so encoded `..` segments can't cross clinics.
- Audio upload, transcription and AI drafts require an active patient consent
  record.
- Generic 5xx responses; structured logs redact tokens, patient identifiers,
  clinical text and storage URLs.
- Upload size limits and in-process rate limits on auth and AI endpoints.
- Staging and production refuse to start without HTTPS and real secrets.
- On the phone: refresh tokens, offline drafts and queued changes live in Expo
  SecureStore, and Android backup rules exclude them.
- CI fails on any high or critical `npm audit` advisory without a documented
  exception (`scripts/audit-exceptions.json`).

## Known limits

- Local development uses plain HTTP on the emulator network.
- Rate limits are per process, not distributed.
- With your own Sarvam key, consented audio and clinical text are sent to Sarvam
  under your account and their terms.
- No regulatory certification is claimed. Do not use this for real clinical care
  without an independent privacy, security and legal assessment.
