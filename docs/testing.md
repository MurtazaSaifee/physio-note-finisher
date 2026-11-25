# Testing

About 920 automated tests across 130 files, plus six Maestro device flows. None of
them call a paid API or need a key.

| Suite | Files | Tests | Runner |
| --- | --- | --- | --- |
| Backend (`backend/tests`) | 77 | 536 | Vitest + `fastify.inject` |
| Mobile (`mobile/tests`) | 54 | 385 | Vitest + React Native Testing Library |
| Shared contracts | 1 | 2 | Vitest |
| Device flows (`mobile/.maestro`) | 6 flows | | Maestro on an Android emulator |

## Commands

| Command | What it runs |
| --- | --- |
| `npm run verify:local` | Expo doctor, Prisma doctor, ESLint, TypeScript, all Vitest suites, and the backend suite again without a database |
| `npm test` | All Vitest suites |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript across the workspaces |
| `npm run audit:gate` | `npm audit` with documented exceptions; fails on high or critical |
| `npm run api:tour` | The end-to-end API walkthrough in [api-tour.md](api-tour.md) |
| `npm run e2e:android:local` | Maestro regression (see [`mobile/.maestro/README.md`](../mobile/.maestro/README.md)) |

## What the security suites pin down

- Storage downloads need auth, stay inside the caller's clinic, and reject encoded
  `..` traversal.
- Replaying a rotated refresh token revokes the user's sessions; a stale logout
  can't kill a newer login.
- JWTs are verified with a pinned algorithm.
- Audio upload, transcription and AI drafts all require patient consent.
- 5xx responses are generic; logs redact tokens, identifiers and clinical text.
- Sessions can't be created already finalized.
- Staging/production refuse to boot with local adapters or missing secrets.

## Continuous integration

[`ci.yml`](../.github/workflows/ci.yml) starts a PostgreSQL 16 service, runs
`npm ci`, the audit gate, `prisma migrate deploy` and the seed, then
`npm run verify:local` on Node 22.

## Not covered

Real-device audio quality, reconnect timing on flaky networks, and clinical
accuracy of model output are checked by hand, not by the suite.
