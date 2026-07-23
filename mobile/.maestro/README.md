# Maestro E2E Testing

This directory holds the Android E2E flows for Physio Note Finisher.

## What It Covers

- `mobile/.maestro/local/regression.yml`: local database plus non-AWS service path.
- `mobile/.maestro/staging/regression.yml`: optional staging path for local Maestro use.
- Shared flows live in `mobile/.maestro/shared/`.

## Local E2E Setup

Use the local Maestro suite when you want to verify the app end to end against local services.

For the Maestro emulator path, make sure all of these are true first:

- the backend is running and reachable on `http://localhost:3000` or `http://localhost:3001`
- Metro is running and reachable on `http://localhost:8081`
- the Android emulator is booted and the app is installed on it
- the dev clinician credentials exist: `clinician@example.com` / `password123`
- the voice flow intentionally records long enough to satisfy the backend minimum of 5 seconds before upload

Minimal local boot sequence:

```bash
# backend
cd backend && npm run dev

# Metro
cd mobile && EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 npm run start -- --lan

# if needed, install the debug app on the emulator
cd mobile && npm run android

# reverse ports for the emulator
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

If port `3000` is busy, use `3001` in both the backend and Metro commands and reverse that port too.

For phone-based local smoke testing, use `scripts/phone-wireless-dev-up.sh` and `scripts/phone-wireless-dev-down.sh` from the repo root.

Run the local suite:

```bash
npm run e2e:android:local
```

### Local Logs and Artifacts

- Backend log: `/tmp/backend.log`
- Metro log: `/tmp/expo.log`
- Maestro run output: `~/.maestro/tests/<timestamp>/`
- Maestro log: `~/.maestro/tests/<timestamp>/maestro.log`
- Failure screenshot: `~/.maestro/tests/<timestamp>/screenshot-*.png`

## Common Gotchas

- The appointment flow is intentionally based on stable test IDs, not loose text matches.
- If a filled field is hard to clear, the flows usually use long-press plus erase before retyping.
- If the keyboard hides a button, hide the keyboard before scrolling or tapping again.
- The shared voice flow waits 6 seconds before stopping recording so the local upload endpoint accepts the clip.

## Related Docs

- `.agents/skills/android-phone-local-testing/SKILL.md` when that local skill is available
- `docs/development/local-android-dev-and-e2e.md`
