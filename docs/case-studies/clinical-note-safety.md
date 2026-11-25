# Case study: AI drafts, clinician-owned notes

**Problem.** An AI-drafted note that looks finished invites signing without reading.
A clinical record also has to stay trustworthy after it is signed.

**Design.**

- **Drafts, never facts.** Transcript, SOAP sections and the patient summary all
  arrive as editable drafts. The app walks the clinician through
  Draft → Review → Finish, section by section, before finalizing.
- **AI is optional.** The manual SOAP composer works with no provider at all, and
  is the path the app falls back to when AI is unavailable.
- **Locked, not frozen.** Finalized notes reject ordinary edits. Reopening is an
  explicit endpoint that writes an audit event, so the invariant is "locked until
  deliberately reopened"
  ([`routes/notes.ts`](../../backend/src/api/routes/notes.ts),
  [`auditService.ts`](../../backend/src/domain/audit/auditService.ts)).
- **No shortcuts.** Sessions can only be created as drafts; finalization has to go
  through the note workflow
  ([`sessionSchemas.ts`](../../backend/src/domain/sessions/sessionSchemas.ts)).
- **Consent before any AI.** Audio, transcripts and stored SOAP text are only sent
  to a provider after an active patient consent check
  ([`requirePatientAiConsent.ts`](../../backend/src/api/middleware/requirePatientAiConsent.ts)).

**Limits.** These controls reduce unreviewed finalization and accidental
disclosure. They don't make this a certified medical-record system.
