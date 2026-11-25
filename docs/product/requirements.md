# Physio Note Finisher — Product Requirements (v1)

## Product Overview

Physio Note Finisher is an Android-first, mobile-first physio documentation app for small clinics. It helps a physiotherapist complete documentation immediately after a session by turning a post-visit audio recap into:

- A readable, editable clinical SOAP note.
- A short patient-facing next-step summary.
- A saved session record tied to the patient timeline.

The app is designed to become part of the clinic's daily workflow by combining documentation with lightweight scheduling, reminders, templates, and patient session history.

## Product Goal

Reduce post-session documentation time and after-hours charting for small physio clinics without forcing a full EMR replacement.

## Primary Users

- Solo physiotherapists.
- Small physio clinics with 1–10 clinicians.
- Clinic owners who want faster documentation and basic visit coordination.

## Core Jobs To Be Done

1. Quickly open the current patient visit.
2. Record or type a short recap after the session.
3. Generate an editable SOAP note.
4. Reuse condition-specific templates to avoid writing from scratch.
5. Review past session history before finalizing today's note.
6. Schedule the next visit.
7. Send a reminder for the scheduled visit.
8. Share a simple patient-facing summary of next steps.

## Non-Goals For v1

- Full hospital-grade EMR replacement.
- Billing and insurance claims.
- Multi-location enterprise workflows.
- Deep analytics dashboards.
- Full ambient room recording as the default workflow.
- Complex staff rostering.
- Advanced patient chat or telehealth.

## Core Product Principles

- Mobile-first, optimized for one-handed use on Android phones.
- Fast capture first, editing second.
- AI is assistive, not authoritative.
- Manual entry must always be available.
- Templates should reduce effort, not force rigid charting.
- Scheduling should be simple and tightly connected to documentation.
- Every important action should take at most a few taps.

## Key User Flows

### 1. Complete a Post-Visit Note

1. Therapist opens the app.
2. Therapist selects today’s patient or appointment.
3. Therapist sees basic patient context and recent session history.
4. Therapist records a 30–90 second recap or chooses manual entry (at least 30 seconds and at most 5 mins).
5. System transcribes the recap.
6. System generates a structured draft SOAP note.
7. Therapist edits the note.
8. Therapist optionally regenerates one section.
9. Therapist finalizes the note.
10. Therapist can export SOAP note as a PDF, print it, or copy raw text to clipboard (DOCX is deferred).
11. Therapist can manually share a short patient-facing next-step summary via the OS share sheet.
12. System stores the note in the patient session history.

### 2. Create a Manual Note

1. Therapist opens patient visit.
2. Therapist chooses “Manual note”.
3. Therapist sees SOAP note sections in editable form.
4. Therapist applies a condition template if desired.
5. Therapist writes and saves the note without audio.

### 3. Schedule a Visit

1. Therapist opens patient profile or calendar.
2. Therapist chooses a date and time.
3. Therapist creates an appointment.
4. System stores the visit in the calendar.
5. System prepares visit reminder text for manual sharing.

### 4. Review Patient History

1. Therapist opens patient profile.
2. Therapist sees a reverse-chronological timeline of sessions.
3. Therapist can open prior notes, summaries, and appointment history.
4. Therapist can use the last session as context for the current visit.

## Functional Requirements

## Authentication

- Users must be able to sign in securely.
- v1 supports email/password.
- Session authentication must persist securely on device.
- Only authenticated users can access patient records and notes.

## Patients

- User can create, edit, archive, and search patients.
- Each patient record must include basic demographic and contact information.
- Each patient record must include a chronological session history.
- Each patient record must include upcoming and past appointments.

## Session History

- The system must maintain a timeline of all sessions for a patient.
- Each session must store session date, visit type, note status, final note, and patient summary.
- Therapists must be able to open prior sessions from the patient timeline.
- Therapists must be able to duplicate a prior plan or use a previous session as reference when writing the current note.

## Documentation Modes

The system must support two documentation paths:

- Voice-first note creation.
- Fully manual note creation.

### Voice-first note creation

- The therapist can record a short post-visit recap.
- The app uploads audio securely.
- The backend transcribes the audio.
- The backend generates a draft progress note.
- The therapist can review and edit the result before saving.

### Manual note creation

- The therapist can bypass audio and enter notes manually.
- Manual notes must use the same note structure and export path as AI-assisted notes.
- The therapist must be able to start with a blank note or a condition template.

## Progress Notes

- The system must generate readable, editable progress notes.
- v1 note structure should use SOAP sections:
  - Subjective
  - Objective
  - Assessment
  - Plan
- Each section must be editable independently.
- The therapist must be able to regenerate only one section without replacing the entire note.
- The therapist must be able to finalize and lock a note.
- The therapist must be able to reopen a draft note before finalization.

## Condition Templates

- The system must support physio condition templates that prefill the note structure.
- Templates must be selectable when creating a session note.
- Templates must prefill section prompts, common findings, exercise headings, and plan scaffolds.
- Therapists must be able to edit any template-filled content.
- v1 should include starter templates for common physio conditions such as:
  - Low back pain
  - Neck pain
  - Shoulder pain / impingement
  - Knee pain
  - ACL rehab
  - Tennis elbow
  - Post-op follow-up
  - Balance / gait training
- The system should allow clinic-level custom templates in a later phase.

## Patient Summary

- After note creation, the system must generate a short patient-facing next-step summary.
- The summary must be editable by the therapist.
- The summary should use simple, non-technical language.
- The summary should cover what was done, what to continue at home, and when to return.

## Calendar

- The app must include a simple calendar for upcoming visits.
- The calendar must support day view and basic agenda/list view.
- The therapist must be able to create, edit, reschedule, and cancel appointments.
- Appointments must be linked to patient records.
- The schedule must display appointment status such as upcoming, completed, cancelled, and missed.

## Reminders

- The system must generate reminder text based on scheduled visits.
- Automated sending (like WhatsApp APIs) is out of scope for v1. Instead, the user manually copies the reminder or uses the OS share sheet to send it.
- The user can configure in-app push notification timing (e.g., 24 hours before) to be prompted to send the reminder.
- The system tracks whether the reminder text was copied/shared.

## Session Dashboard

- The home screen must show today’s appointments and recent patient sessions.
- The therapist must be able to filter by date, patient, and note status.
- The dashboard must make it easy to resume incomplete notes.

## Search

- The therapist must be able to search patients.
- The therapist must be able to search prior sessions and note text.

## Export and Sharing

- The therapist must be able to export finalized notes.
- v1 should support PDF and plain text export.
- The therapist must be able to copy note text to another system.
- The therapist must be able to export or share the patient-facing summary separately via the OS share sheet (e.g., to manually send over WhatsApp).

## Notifications

- The app should support push notifications for visit reminders and pending draft reminders.
- The app should support local notifications for device-side reminder fallback where appropriate.

## Offline and Sync Expectations

- The app should remain usable in poor network conditions.
- Therapists should be able to create manual notes offline and sync later.
- Audio upload and AI note generation requires connectivity in v1.
- The user must see clear sync status for pending changes.

## Roles and Access

- v1 is designed and scoped for a single clinician User.
- However, the underlying database schema must be designed with an 'Organization' or 'Clinic' tenant in mind to seamlessly support multi-clinician groups in later versions.
- Future support for admin/reception roles can be designed later.

## Non-Functional Requirements

## Platform

- Client should be built as an Android-first mobile app.
- iOS support should be possible later without rewriting core product logic.
- The app must be optimized for phone screens first.

## Performance

- Opening the app and loading today’s schedule should feel near-instant on normal mobile networks.
- Recording start must feel immediate.
- Note draft generation should provide visible progress and status updates.

## Reliability

- Failed transcription or generation jobs must show clear retry states.
- No generated note should be auto-finalized without user review.
- Draft data must not be lost if the app is closed unexpectedly.

## Privacy and Security

- Patient data, notes, transcripts, and recordings must be treated as sensitive clinical data.
- All network communication must be encrypted.
- Data access must be scoped to authorized users only.
- Audio retention policy must be configurable.
- Logs must avoid storing raw sensitive clinical text by default.

## Auditability

- The system should store who created or edited a note.
- The system should track note status changes such as draft, finalized, regenerated, and exported.

## Accessibility

- The app must support readable typography, large tap targets, and clear contrast.
- Core actions must be usable with one hand.
- Voice and manual paths must be equally accessible.

## Suggested Data Entities

- User
- Patient
- Appointment
- Reminder
- Session
- AudioRecording
- Transcript
- ProgressNote
- PatientSummary
- ConditionTemplate
- ExportFile
- NotificationLog

## v1 Screens

- Splash / Auth
- Today dashboard
- Calendar
- Patient list
- Patient profile
- Session recorder
- Manual note composer
- AI-generated note review
- Patient summary review
- Export / share screen
- Settings

## v1 Success Metrics

- Median time from end of visit to saved note.
- Percentage of sessions documented same day.
- Percentage of notes needing only light edits.
- Number of active therapists using the app weekly.
- Reminder delivery success rate.
- Appointment completion and no-show visibility.

## Open Product Decisions

- Whether reminders should be automated via SMS/WhatsApp. -> Deferred. v1 will rely on generating text and using the OS share sheet for manual sending.
- Whether condition templates are global, clinic-specific, or user-specific in v1. -> User-specific in v1 (laying groundwork for future Organization-level templates).
- Whether patient summaries are shareable directly from the app in v1. -> Yes, via native OS share sheet copying rather than direct app integrations.
- Whether offline audio capture is required in v1 or deferred. -> deferred
- Whether the first release is Android-only or Android plus iOS TestFlight beta. -> Android only
