# Maestro end-to-end flows

Android UI flows that drive the real app against the local backend.

| Flow | What it covers |
| --- | --- |
| `shared/auth-smoke.yml` | Sign-in screen, forgot-password screen and back |
| `shared/app-nav.yml` | Sign in, then Patients → Calendar → Profile → Patients |
| `shared/settings-core.yml` | Profile edit, change-password entry, audio retention policy |
| `shared/create-patient-appointment.yml` | New patient → schedule a visit → start the session |
| `shared/voice-note.yml` | Voice recap → transcript → SOAP draft → summary → finalize → PDF export |
| `shared/manual-note-export.yml` | Manual SOAP note (no AI) → finalize → PDF export |

`local/regression.yml` runs them all in that order.

The flows select elements by `testID` (see the testID rules in `AGENTS.md`). With
no `SARVAM_API_KEY`, the backend uses the offline demo providers, so the voice flow
gets the same transcript and SOAP text every run.

## Running locally

Prerequisites: [Maestro](https://maestro.mobile.dev), an Android emulator, and the
app built once with `npm run android`.

```bash
# 1. Database + seed (once)
npm run setup

# 2. Backend on :3000
npm run dev

# 3. Metro (in another terminal). mobile/.env points the emulator at 10.0.2.2:3000
cd mobile && npx expo start

# 4. The suite
npm run e2e:android:local
```

The flows sign in as the seeded `clinician@example.com` / `password123`. Override
with `LOGIN_EMAIL` and `LOGIN_PASSWORD`.

## Troubleshooting

- **`device offline` / `Device server died` mid-run.** The emulator's adb link has
  dropped. Make sure only one adb version is on your `PATH` (two different adb
  versions keep restarting each other's server), then cold-boot the emulator.
- **Sign-in fails with "Network request failed".** The app is not reaching the API.
  A `mobile/.env.local` overrides `mobile/.env`. On the emulator, either use
  `http://10.0.2.2:3000`, or keep `localhost` and run
  `adb reverse tcp:3000 tcp:3000` (repeat it after any adb restart). The app shows
  the generic sign-in error in this case, and the API logs no login request.
- **Keyboard or stylus pop-ups cover elements.** Turn off Gboard's stylus
  handwriting: `adb shell settings put secure stylus_handwriting_enabled 0`.
- Artifacts for each run (screenshots, `maestro.log`) are in `~/.maestro/tests/<timestamp>/`.
