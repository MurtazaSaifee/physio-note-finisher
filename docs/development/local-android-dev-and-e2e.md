# Local Android Dev and E2E Guide

This is the single canonical guide for local Android development and E2E testing.

## Supported Local Flows

- Device-free local verification
- Emulator-linked local stack (default)
- Physical Android phone over USB (`adb reverse`)
- Local Android E2E workflow

## 1. Device-Free Local Verification

Run this when you want a single command that checks Expo/React config, TypeScript, and tests without booting an emulator or phone:

```bash
npm run verify:local
```

What it runs:

- `react-doctor` using Expo Doctor
- Prisma local config sanity
- lint
- TypeScript
- mobile/backend/shared test suites
- backend CI-mode test with `DATABASE_URL` removed

This command is intentionally device-free. Emulator-backed E2E is a separate step.

## 2. Start Local Runtime

Use the repo scripts when you are about to run device-backed E2E:

```bash
# Emulator mode
scripts/emulator-dev-up.sh

# Tear down emulator mode
scripts/emulator-dev-down.sh
```

For a physical phone over USB, run `adb reverse tcp:3000 tcp:3000` and
`adb reverse tcp:8081 tcp:8081`, then set `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`.

Emulator mode uses `adb reverse` for both Metro and the backend. That is the default because it is more reliable than depending on emulator Wi-Fi and LAN routing.

Before installing or rebuilding the local Android app, make sure `java -version` resolves to Java 21. Newer Homebrew default Java versions can break the Gradle and Expo Android toolchain in this repo.

## 3. Run Android E2E (Local)

```bash
npm run e2e:android:local
```

### Coverage Matrix

| Area | Maestro coverage | Lower-level coverage | Missing or still manual |
| --- | --- | --- | --- |
| Auth and session | `auth-smoke.yml`, `signin.yml` in every Maestro flow | `mobile/tests/auth/*`, `backend/tests/auth/*` | Full sign-up and password-reset completion, lockout, refresh-token expiry |
| Dashboard and patients | `app-nav.yml`, `create-patient-appointment.yml`, `manual-note-export.yml` | `mobile/tests/dashboard/*`, `mobile/tests/patients/*`, `backend/tests/patients/*`, `backend/tests/dashboard/*` | Pagination, merge/duplicate handling, corrupted patient data, empty-state permutations |
| Notes and SOAP | `voice-note.yml`, `manual-note-export.yml` | `mobile/tests/notes/*`, `backend/tests/notes/*`, `backend/tests/voice/*` | Concurrent edits, malformed templates, regeneration failure recovery, save conflicts |
| Voice capture and transcription | `voice-note.yml` | `mobile/tests/voice/*`, `backend/tests/voice/*`, `backend/tests/audio/*` | Mic permission denial, too-short clips, interrupted uploads, network loss and retry |
| Calendar | `app-nav.yml`, `create-patient-appointment.yml` | `backend/tests/google-calendar/*`, `backend/tests/appointments/*`, `mobile/tests/calendar/*` | Real OAuth handoff, revoked access, sync conflicts, duplicate event handling |
| Export and share | `manual-note-export.yml`, `voice-note.yml` | `mobile/tests/exports/*`, `backend/tests/exports/*` | Share-sheet cancellation, PDF generation failure, storage-full conditions |
| Settings and preferences | `settings-core.yml` | `mobile/tests/settings/*`, `backend/tests/notifications/*`, `backend/tests/security/*` | Invalid preference values, permission failures, stale profile state after reconnect |
| Offline and sync | None at device E2E level | `mobile/tests/offline/*`, `backend/tests/offline/*`, `backend/tests/integration/local-runtime.test.ts` | Full device offline/reconnect recovery while an actual session is open |
| Audit and timeline | `manual-note-export.yml` | `mobile/tests/audit/*`, `backend/tests/audit/*`, `backend/tests/sessions/*` | Retention edge cases, audit replay across partial failures |

Artifacts and flows live in:

- `mobile/.maestro/`
- `mobile/.maestro/local/regression.yml`

## Notes

- Do not use ad-hoc root scripts or duplicate documentation. Keep local Android workflow updates in this file.
- If script behavior changes, update this guide in the same commit.
- The current local Android package id is `com.murtazasaifee.physionotefinisher`. Keep `mobile/app.config.ts` and `mobile/android/app/build.gradle` aligned.
