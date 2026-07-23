# Testing and verification

The repository uses Vitest for focused backend, mobile and shared-contract tests. Tests do not call Sarvam or require a real API key.

## Current automated coverage

- Storage downloads require authentication, enforce clinic ownership and reject path traversal.
- Refresh-token predecessor replay revokes the successor session.
- Stale logged-out tokens cannot invalidate a later login.
- SOAP and patient-summary generation require patient AI-processing consent.
- Session creation cannot directly create a finalized record.
- Mobile password changes use the backend's authenticated contract.
- Mobile logout fails closed in memory if SecureStore deletion fails.
- Offline draft indexing and dead-letter retention limits are covered.
- Shared profile validation is covered.

This is intentionally a focused regression suite, not a claim of complete product or clinical validation.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run verify` | ESLint, TypeScript checking and every committed Vitest suite |
| `npm run lint` | ESLint across mobile, backend and shared TypeScript |
| `npm run typecheck` | TypeScript checking across all workspaces |
| `npm test` | All Vitest suites |
| `npm audit` | Dependency advisory audit |
| `npm run doctor` | Expo project diagnostics |
| `npm run e2e:android:local` | Optional Maestro flow against an already-running local app |

## Continuous integration

`.github/workflows/ci.yml` provisions PostgreSQL 16, runs `npm ci`, applies the committed Prisma migration, then runs type checking, tests and a high-severity dependency audit.

## Manual checks before publication

- Run `npm run local:setup` from a clean checkout.
- Start the backend and verify health, login and an authenticated data request.
- Build the Android debug APK.
- With a personal Sarvam key and synthetic data, record a recap and complete transcript, SOAP draft and patient-summary review.
