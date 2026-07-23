# Security notes

This is a local demonstration project, not a certified medical system or a claim of regulatory compliance.

## Implemented safeguards

- Access and refresh tokens use separate secrets.
- Passwords are hashed with bcrypt.
- Refresh tokens are rotated; replay of a rotated predecessor revokes the user's active sessions.
- Protected records and file downloads are scoped to the authenticated clinic.
- Local file paths are contained beneath the configured storage root.
- Authentication and AI-generation endpoints are rate-limited in process.
- Patient consent is checked before audio or clinical text is sent to Sarvam.
- Mobile refresh tokens, offline drafts and queued clinical changes use Expo SecureStore.
- Android backup rules exclude SecureStore and exported clinical-document folders.
- Environment files, local uploads and generated output are ignored by Git.

## Demonstration limitations

- Local HTTP is used for emulator/device development.
- Rate limits are process-local and are not designed for a distributed deployment.
- Local files and the Docker database remain on the developer's machine until removed.
- A user-supplied Sarvam key sends consented audio or clinical text to Sarvam under that user's Sarvam account and terms.

Use synthetic data only. Do not use this repository for real clinical care without an independent privacy, security, legal and operational assessment.

## Secrets

Copy the committed `.env.example` files to untracked `.env` files. Never commit real JWT secrets, API keys, patient data, recordings or generated clinical documents.

## Reporting a vulnerability

Use GitHub's private security-advisory feature for the repository rather than a public issue. Include the affected route or component, impact and reproducible steps.
