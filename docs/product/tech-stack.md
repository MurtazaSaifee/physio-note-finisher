# Tech Stack

## 1. Product Form Factor

### Decision

Build the product as an **Android-first React Native app** for v1, with the architecture kept compatible with later **iOS** support.

### Notes

- The product is a **mobile-first physio documentation and visit coordination app** for small clinics.
- Android is the priority release target because it is the fastest path to validating clinic workflow adoption.
- iOS support should follow from the same shared codebase rather than from a separate rewrite.
- The app must be optimized for phone use in clinics, including one-handed flows, fast patient lookup, and quick post-visit capture.
- A web admin portal is not required in v1.

---

## 2. Frontend Client Stack

### Decision

Use:

- **React Native**
- **TypeScript**
- **Expo**
- **Expo Router**

### Notes

- The mobile app should be built in a single React Native codebase.
- Expo is the default choice because it simplifies Android-first delivery, native module management, notifications, and future iOS support.
- Expo Router is preferred over manually wiring navigation from scratch because the app has a clear screen-based flow and benefits from convention.
- The app is stateful and authenticated, but does not need server-rendering.
- The client should be structured so domain logic can later be shared with other surfaces if needed.

---

## 3. Frontend Libraries and Conventions

### Decision

Use the following mobile libraries and conventions:

- **UI primitives / styling:** NativeWind + React Native core primitives
- **Component library:** custom design system built on top of React Native primitives; use a lightweight library only where it clearly saves time
- **Forms:** React Hook Form
- **Validation:** Zod
- **Server-state / data fetching:** TanStack Query
- **Local persistent storage:** MMKV for lightweight app state, secure storage for tokens/secrets
- **Local offline database:** `expo-sqlite` (potentially layered with WatermelonDB) to robustly queue relational data like manual drafts and offline appointments before syncing.
- **Rich text / note editing:** plain section editors in v1, not a heavy rich-text document editor
- **Audio capture:** Expo AV or Expo Audio-compatible recording path
- **Notifications:** Expo Notifications
- **Testing:** Jest + React Native Testing Library

### Notes

- Keep the visual system clean and clinic-friendly rather than consumer-app styled.
- While NativeWind enables fast UI iteration, be prepared to fall back to standard React Native `StyleSheet` for highly complex or frequently re-rendered list views to maintain performance.
- The app should prefer simple text-area based note editing for each section instead of trying to replicate a desktop rich text editor on mobile.
- TanStack Query should handle API reads, mutations, cache invalidation, and background refresh.
- Use Zod schemas at the app boundary for request payload validation and screen-level form safety.
- Avoid heavy state-management libraries in v1 unless a real complexity threshold is reached.

---

## 4. Mobile Architecture Principles

### Decision

Use an **online-first but resilient mobile architecture**.

### Notes

- Core workflows should work smoothly on normal mobile connectivity.
- Manual note drafting and appointment updates should be resilient to temporary connectivity issues.
- Audio upload and AI generation can require connectivity in v1, but the app must clearly show upload status, failure states, and retry actions.
- The app should preserve unsaved draft text locally to avoid losing data when interrupted.
- Push notifications and local device notifications should both be supported where appropriate.

---

## 5. Backend Stack

### Decision

Use:

- **TypeScript**
- **Node.js**
- **Fastify**
- **REST API**
- **API versioning prefix: `/api/v1/`**

### Service Shape

Run the backend as **two processes from day one**:

- **API service:** Fastify application serving auth, CRUD, scheduling, and job-status endpoints
- **Worker process:** separate SQS poller for long-running and retryable tasks

### Notes

- The API service handles synchronous request/response flows: auth, patient CRUD, appointments, note CRUD, upload orchestration, and job-status reads.
- The worker handles long-running and retryable tasks: transcription, note generation, patient summary generation, reminder dispatch, and export jobs where needed.
- `Amazon SQS` should be used for all background work rather than in-process promises or Redis queues.
- The backend remains the system of record and the only place where AI providers are called.

---

## 6. Database

### Decision

Use:

- **PostgreSQL** as the primary application database
- **PostgreSQL running on the EC2 host for v1**
- **pgvector** as a forward-compatible extension
- **Prisma** for ORM and migrations

### Notes

- PostgreSQL is the source of truth for users, patients, appointments, reminders, sessions, transcripts, notes, templates, summaries, and job metadata.
- Relational modeling is the right fit for the clinic workflow and scheduling-heavy feature set.
- Prisma opens eager connections, so the live deployment keeps PostgreSQL local to the EC2 host for v1.
- Full-text search should be supported for patient lookup and note lookup.
- pgvector should be included in the schema from the start, but retrieval features remain deferred until there is a real product need.
- Every schema change must go through versioned Prisma migrations.

### Core Entities

- `users`
- `patients`
- `appointments`
- `reminders`
- `sessions`
- `audio_recordings`
- `transcripts`
- `progress_notes`
- `patient_summaries`
- `condition_templates`
- `jobs`
- `exports`
- `notification_logs`

---

## 7. AI Services

### Decision

Keep AI behind **provider abstractions** and support these explicit provider modes:

- **local-dev**
- **self-hosted**
- **external-managed**
- **hybrid**

The default production direction is **hybrid**.

### Workloads

The app has three distinct AI-assisted workloads:

- **Speech-to-text (STT):** short post-visit audio recap -> transcript
- **Progress note generation:** transcript + session context + template context -> structured note draft
- **Patient summary generation:** note/session context -> plain-language next-step summary

### Internal Interfaces

Expose internal interfaces such as:

- `TranscriptionProvider.transcribe(audio, metadata) -> TranscriptResult`
- `NoteGenerationProvider.generate_note(transcript, context) -> NoteDraft`
- `NoteGenerationProvider.regenerate_section(transcript, current_note, section, context) -> NoteSectionResult`
- `SummaryGenerationProvider.generate_summary(note, context) -> PatientSummaryDraft`
- `ProviderPolicy.can_send_external(data_type, mode) -> bool`

### Notes

- Business logic must depend on internal interfaces, never directly on vendor SDKs.
- STT and text-generation providers may differ by cost, latency, privacy posture, and language quality.
- Provider selection must remain configurable at the backend layer.

### STT Requirements

Because the product may involve Hindi, English, Gujarati, and mixed usage, provider evaluation must test:

- multilingual code-switching support
- Indian accent robustness
- short clinical recap accuracy
- timestamp quality where useful
- compliance posture for sensitive audio

### Output Validation

- Progress notes must be validated against a fixed typed schema before persistence.
- If generation fails validation, the job must fail safely and remain retryable.
- Raw invalid model output must never be written to the final notes table.
- Regeneration should operate at the section level.
- Any unsupported inference should default to conservative placeholders instead of fabricated detail.

---

## 8. Documentation Model

### Decision

Support two first-class note creation paths:

- **Voice-first recap -> AI draft**
- **Manual note entry**

### Notes

- Manual note creation is not a fallback-only edge case; it is a core supported workflow.
- All note paths should converge into the same `progress_notes` model so edit, export, and history behavior remain consistent.
- v1 note structure should use SOAP sections:
  - Subjective
  - Objective
  - Assessment
  - Plan
- Therapists must be able to edit any section before finalization.
- Therapists must be able to regenerate only one section rather than regenerating the entire note.

---

## 9. Condition Template System

### Decision

Add **condition templates** as a first-class product feature in v1.

### Notes

- Templates should prefill note scaffolding and prompt thinking, not lock the therapist into rigid text.
- Each template may provide:
  - default SOAP section prompts
  - common findings placeholders
  - exercise / intervention headings
  - plan scaffolds
- Start with predefined templates for common physio conditions.
- Therapist edits always take precedence over template defaults.
- Custom templates map directly to the User in v1, ensuring groundwork is laid for future Organization/Clinic-owned templates without redesigning the model.

---

## 10. Patient History and Session Timeline

### Decision

Support **patient timeline views** from v1.

### Notes

- Each patient profile should show past sessions, finalized notes, upcoming appointments, and key summaries.
- The mobile client should render history in a reverse-chronological timeline that is easy to skim on a phone.
- The current session flow should make previous plans and recent notes visible without forcing screen overload.
- This is relational history, not semantic RAG retrieval.

---

## 11. Scheduling and Calendar

### Decision

Include a **simple appointment calendar** in v1.

### Notes

- The calendar should support day view and agenda/list view.
- Therapists must be able to create, edit, reschedule, cancel, and complete appointments.
- Appointments must be linked to patient records.
- Appointment states should include at minimum: `scheduled`, `completed`, `cancelled`, `missed`.
- Do not turn v1 into a full clinic operations suite; keep scheduling deliberately lightweight.

---

## 12. Reminder System

### Decision

Add visit reminders as a **manual sharing capability** with in-app nudges.

### Notes

- Automated API integrations (like Twilio or Meta WhatsApp) are deferred from v1.
- The system generates pre-formatted reminder text and surfaces it to the therapist.
- The therapist uses the OS share sheet (or copy/paste) to send the reminder to the patient manually.
- The system uses in-app or push notifications to prompt the therapist when a reminder is due.
- Reminder interactions (e.g. "Marked as shared") should be logged.

### Reminder Architecture

- Appointment creation schedules reminder jobs.
- Worker dispatches reminders when due by consuming SQS work items.
- Delivery outcome is written to `notification_logs`.
- Failed sends should be retryable according to channel policy.

---

## 13. Background Job System

### Decision

Use:

- **Amazon SQS** as queue and job backend
- **SQS pollers** as the worker system

### Job Types

Workers are responsible for:

- transcription jobs
- note generation jobs
- section regeneration jobs
- summary generation jobs
- reminder notification prep jobs
- export jobs

### Notes

- The API exposes job-state reads over HTTP; the client can refresh status when needed.
- Explicit job states should include: `queued`, `active`, `completed`, `failed`.
- The system should support retryable failures and operational visibility per job type.
- SQS provides durability and retry behavior in the live implementation.

---

## 14. Auth Approach

### Decision

Use the backend's own authentication flow:

- **Email/password sign-in**
- **JWT-based bearer auth** for API access
- **Role-aware authorization model**, minimal in v1

### Notes

- The mobile client must store access/session credentials securely using platform-secure storage.
- The backend should remain the authority for identity and access control.
- v1 is built around a single therapist User per account.
- The database schema should keep room for an `Organization` or `Clinic` tenant entity so future multi-clinician capabilities do not require a massive schema rewrite.
- Future clinic-admin or receptionist roles should be planned for in the schema, but not fully built unless needed.

---

## 15. File Storage

### Decision

Use:

- **Amazon S3** as the primary object storage layer
- **Presigned URLs** for controlled upload/download flows

### Notes

- Audio files and exports belong in object storage, not in PostgreSQL.
- The mobile app should request a presigned upload target from the backend, upload the audio file, and then notify the backend to create processing jobs.
- The backend must validate allowed file types and durations.
- Audio retention should be policy-driven and configurable.
- Export files should inherit the same protected access model as recordings.

### Accepted Audio Shapes

- Prefer short post-visit recaps, not continuous ambient room recordings.
- Mobile OS audio capture formats vary widely (m4a, aac, wav). Normalize audio only if the live processing pipeline needs it; keep the backend pipeline simple.
- Accepted audio container/codec combinations should be constrained and normalized through the upload pipeline.

---

## 16. Export System

### Decision

Use:

- **Backend worker process** for server-side PDF generation
- **Amazon S3** for export file storage
- **plain text** as an alternate export format

### Notes

- Finalized notes should be exportable as PDF and plain text.
- Patient-facing summaries should also be exportable or shareable independently.
- The export system should render consistent clinical documents independent of client platform.
- Export jobs run through the worker-backed job pipeline in the live implementation.

---

## 17. Notifications and Device Integrations

### Decision

Use:

- **Expo Notifications** for push notifications
- local device notifications where appropriate

### Notes

- The app should register device tokens after user opt-in.
- Notification preferences should be tied to the user and the clinic workflow.
- Device notifications are used for reminder delivery and unfinished-draft nudges.
- Notification handling should be separated from note-generation logic.

---

## 18. Offline and Sync Strategy

### Decision

Use a **limited offline strategy** in v1.

### Notes

- Manual notes, draft edits, and some appointment edits should be stored locally via `expo-sqlite` first, and synced when connectivity returns. This avoids overwhelming MMKV or TanStack Query.
- Audio upload and AI generation may remain online-required in v1.
- The app must clearly show sync state for pending local changes.
- Conflict handling should be simple and deterministic.
- Full offline-first multi-device sync complexity is out of scope for the first release.

---

## 19. Rate Limiting and Abuse Protection

### Decision

Add basic protection from day one.

### Required Limits

- maximum audio size per upload
- maximum audio duration per recap
- maximum concurrent active AI jobs per user
- per-user API rate limiting on job-creating endpoints
- server-side limits on reminder dispatch bursts where needed

### Notes

- Limits protect cost, system stability, and provider quotas.
- Job-level resource checks should happen before dispatching expensive AI calls.

---

## 20. Deployment and Infrastructure

### Decision

Use:

- **AWS EC2** for backend runtime
- **Amazon S3** for object storage
- **Amazon Route 53** for DNS
- **Amazon SQS** for background jobs
- **AWS Systems Manager** for secrets and server access
- **GitHub Actions** for CI/CD
- **Terraform** for infrastructure as code

### Service Layout

- Mobile client: Expo/React Native application distribution
- API: Node.js (Fastify) service on EC2
- Worker: separate SQS-polling background-job service
- Database: PostgreSQL on the EC2 host via localhost
- Export Worker: part of the EC2 worker process, not Lambda
- Queue: SQS
- Storage: S3

### Notes

- The client distribution path is now app-based rather than static-site hosting.
- Backend service separation remains the same because the workload shape still includes long-running jobs.
- A staging environment is required before production.

---

## 21. Observability and Logging

### Decision

Start with:

- **OpenTelemetry**
- **Sentry**
- **structured JSON logs**

### Notes

- Correlation IDs should flow across mobile requests, API requests, worker jobs, and provider calls.
- Sensitive note text, transcripts, prompts, and audio-derived content must not be logged by default.
- Capture operational metadata such as job type, provider, duration, retry count, status, and error class.
- Mobile crash/error reporting should be included in the app client as well as the backend.

---

## 22. Testing Strategy

### Decision

Use a **test-first, integration-aware** development approach.

### Backend Testing

- **Vitest**
- Fastify inject/test helpers
- provider adapter mocks/fakes
- queue/storage fakes
- migration tests where useful

### Mobile Testing

- **Jest**
- **React Native Testing Library**
- screen-level tests for key workflows
- API mock layer for client behavior testing

### Core Rules

- Every major feature must have tests.
- Business logic must remain outside route/controller glue where practical.
- Provider integrations must be mockable.
- Storage, notifications, and queue boundaries must be mockable.
- Regression tests are required for production bugs.

---

## 23. Repository Structure

### Decision

Use a **single monorepo**.

### Shape

```text
mobile/
backend/
  src/
    api/
    workers/
    domain/
    providers/
  prisma/
    schema.prisma
    migrations/
infra/
docs/
scripts/
```

### Notes

- A monorepo is appropriate because one primary engineer is building client, backend, infra, and AI integrations together.
- Cross-cutting features like reminders, note generation, and exports benefit from shared visibility across layers.

---

## 24. Documentation Standards

### Decision

Documentation is mandatory.

### Required Docs

- root `README.md`
- architecture and product docs under `docs/`
- setup docs for mobile and backend environments
- API contracts
- feature workflow docs for note generation, templates, reminders, and scheduling

### Rules

- Documentation must explain intent, boundaries, and data flow.
- Docs must be updated alongside implementation.
- Major product/architecture decisions must be recorded in markdown.

---

## 25. Out of Scope for v1

The following are intentionally deferred unless they become critical:

- full billing and insurance claim workflows
- multi-clinic multi-tenant architecture
- advanced analytics dashboards
- semantic retrieval / RAG-based history grounding
- full ambient room recording as the default mode
- deep staff rostering and payroll workflows
- complex desktop admin portal
- enterprise compliance programs beyond baseline best practices

---

## 26. Recommended v1 Delivery Scope

The first release should focus on:

- authentication
- patient records
- patient session history
- condition templates
- appointment calendar
- visit reminders
- short voice recap capture
- manual note entry
- AI-assisted SOAP note drafting and section regeneration
- patient summary generation
- finalized note export

### Rule

If a feature does not clearly improve note completion speed, appointment follow-through, or continuity across visits, it should be challenged before inclusion in v1.

### AI Strategy and Compliance

AI providers: Use a hybrid backend architecture; evaluate Whisper large-v3 and Google Speech-to-Text for transcription, and use an OpenAI-compatible structured-output model for SOAP generation behind strict schema validation.

Transcription location: Backend-handled in v1; on-device transcription is deferred unless offline/privacy requirements make it essential.

Compliance baseline: India-first launch should align to the DPDP Act, 2023 and ABDM Health Data Management Policy principles, especially consent, purpose limitation, security safeguards, retention controls, and breach handling.
