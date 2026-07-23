# Case study: clinician-controlled notes

AI-generated text is treated as a draft, not a signed clinical fact. The mobile workflow presents transcript and SOAP sections for clinician editing before finalization. A manual SOAP composer remains available without Sarvam.

Finalized notes reject normal editing. The application also exposes an explicit reopen action, so the accurate invariant is “locked until deliberately reopened,” not permanent immutability. Session creation is restricted to draft status; finalization must pass through the note workflow where review and audit behavior are applied.

Patient AI-processing consent is checked before audio, transcripts or stored SOAP text are sent to Sarvam. These controls reduce accidental disclosure and unreviewed finalization, but they do not make this demonstration a certified medical-record system.
