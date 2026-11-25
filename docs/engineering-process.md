# How this was built

A solo build, from an empty repo in April 2026 to a deployed Android app, over
800 commits in the private development repository. The interesting part isn't the volume; it's the loop that kept a
clinical app honest while moving fast.

## Phases, not a backlog

Work was cut into 14 phases, each with a goal, explicit requirements, a plan of
small reviewable steps, and a verification step before the next phase started:

| # | Phase | Outcome |
| --- | --- | --- |
| 1 | Foundation, security, clinical access | Auth with token rotation, clinic scoping, audit model |
| 2 | Patients and session continuity | Patient CRUD, timeline, copy-forward from the last visit |
| 3 | Manual SOAP notes and templates | A complete note path with no AI at all |
| 4 | Design system and app shell | The "Meridian" component library and navigation |
| 5 | Onboarding and settings | Sign-up, email OTP, password change, policy surfaces |
| 6 | Dashboard and session intake | Patient workspace and start-session flow |
| 7 | Voice capture and AI SOAP editing | Recording, transcript review, drafts, section regeneration |
| 8 | Calendar and appointments | Appointment lifecycle, calendar views, visit launch |
| 9 | Export and sharing | PDF/text export, patient summary sharing |
| 10 | Offline, audit, privacy hardening | Encrypted offline queue, audit history, retention |
| 11 | Voice pipeline hardening | Staged, idempotent, retryable jobs with real STT |
| 12 | Backend AI and production wiring | S3, SQS, SES, provider validation, PDF rendering |
| 13 | Production deployment | Terraform, EC2, Caddy, systemd worker, SSM secrets, backups |
| 14 | Templates revamp | Condition-specific note templates |

The manual note path came *before* any AI (phase 3 vs 7) on purpose: the product
rule is that AI can help but must never block finishing a note.

## The review loop

Each phase ended with the same checks before moving on:

1. **Automated gate.** `npm run verify:local`: Expo doctor, Prisma doctor, ESLint,
   TypeScript, and every Vitest suite in the three workspaces, plus the backend
   suite again with no database configured.
2. **Security pass.** A focused review of the phase's new surface: auth, tenancy,
   consent, storage paths, logging. Findings became tests, not just fixes. The
   files under `backend/tests/security/` are mostly regression tests for real
   findings, such as the encoded `..` storage-key traversal.
3. **Device check.** Maestro flows on an Android emulator against the local stack,
   selecting elements by stable `testID`s (a rule for every interactive element).
4. **UI review.** Screenshot-based review against the design system, with fixes
   planned as their own steps.

## Testing strategy

- **Domain logic** is tested without HTTP or a database where possible.
- **Routes** are tested through `fastify.inject`, including the negative cases:
  wrong clinic, missing consent, replayed refresh token, oversized upload.
- **Providers** are tested against recorded and malformed responses, so the app
  survives an LLM returning nonsense.
- **Device flows** run in Maestro with deterministic demo providers, so the voice
  flow gives the same transcript and note every run.

See [testing.md](testing.md) for the suites and commands.
