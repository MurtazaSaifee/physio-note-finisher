# Physio Note Finisher — Backend

Fastify-based REST API for the Physio Note Finisher mobile app.

## Quick Start

```bash
# Install dependencies (run from repo root)
npm install

# Set up environment
cp .env.example .env
# Edit .env with your local values

# Start PostgreSQL for local development (staging and production boot it on EC2)
createdb physio_note_finisher

# Apply Prisma migrations
npx prisma migrate deploy
npx prisma generate

# Start dev server
npm run dev
```

## Environment Variables

See `.env.example` for a complete template. Critical variables are validated at startup; the server will fail fast if they are missing or invalid.

### Required

| Variable | Description | Validation |
|----------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection string | Must be non-empty |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | Min 1 char (use strong random string in prod) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | Min 1 char (use strong random string in prod) |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token lifetime | Positive integer |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh token lifetime | Positive integer |
| `BCRYPT_COST_FACTOR` | Password hashing rounds | Integer 8–15 |
| `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE` | Login rate limit | Positive integer |
| `AUTH_REFRESH_RATE_LIMIT_PER_MINUTE` | Token refresh rate limit | Positive integer |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Runtime environment | `development` |
| `TRUST_PROXY` | Trust `X-Forwarded-*` headers | `false` |
| `DEV_CLINICIAN_PASSWORD` | Auto-seed dev clinician (dev only) | — |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google OAuth client secret | — |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Google OAuth callback URL | — |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | AES key for token encryption | — |
| `S3_REGION` | S3-compatible storage region | — |
| `S3_BUCKET` | S3-compatible storage bucket | — |
| `S3_ACCESS_KEY_ID` | S3 access key | — |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | — |
| `AWS_REGION` | AWS region for SQS/S3/SSM | — |
| `SQS_VOICE_QUEUE_URL` | Voice job queue URL | — |
| `SQS_CALENDAR_QUEUE_URL` | Calendar job queue URL | — |
| `SQS_REMINDER_QUEUE_URL` | Reminder job queue URL | — |
| `SQS_EXPORT_QUEUE_URL` | Export job queue URL | — |
| `SQS_WAIT_TIME_SECONDS` | SQS long-poll wait time | `20` |
| `LOCAL_STORAGE_DIR` | Local file fallback directory | `./tmp/uploads` |
| `VOICE_PROVIDER_DEFAULT` | Default STT provider | `sarvam` |
| `VOICE_LLM_DEFAULT_MODEL` | Default LLM model | — |
| `VOICE_PROVIDER_MATRIX_JSON` | Provider fallback matrix JSON | — |
| `RETENTION_SCHEDULER_ENABLED` | Enable audio cleanup scheduler | `false` |
| `RETENTION_SCHEDULER_INTERVAL_MS` | Cleanup interval in ms | `3600000` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with auto-reload |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |

## Database

Prisma is used for schema management and queries.

```bash
# Generate client after schema changes
npx prisma generate

# Check migration status
npx prisma migrate status

# Apply pending migrations (production)
npx prisma migrate deploy

# Create a new migration (development)
npx prisma migrate dev --name descriptive_name

# Open Prisma Studio
npx prisma studio
```

## Architecture

```
src/
├── api/
│   ├── middleware/       # Auth, rate limiting, validation
│   └── routes/           # Fastify route handlers
├── config/
│   └── env.ts            # Environment validation schemas
├── data/
│   └── prismaClient.ts   # Prisma client singleton
├── domain/
│   ├── appointments/
│   ├── audit/
│   ├── auth/
│   ├── google-calendar/
│   ├── notes/
│   ├── patients/
│   ├── sessions/
│   └── voice/
├── infrastructure/
│   └── s3/               # S3-compatible storage client
├── observability/
│   └── logger.ts         # Structured logging
├── workers/
│   ├── exportWorker.ts
│   ├── retentionScheduler.ts
│   ├── sqsCalendarPoller.ts
│   ├── sqsExportPoller.ts
│   ├── sqsReminderPoller.ts
│   ├── sqsVoicePoller.ts
│   └── sqsPoller.ts
├── entry/
│   ├── worker.ts         # Worker entrypoint
├── index.ts              # Dev entrypoint
└── server.ts             # Server builder
```

## Testing

Tests use Vitest with in-memory mocks for Prisma and external services.

```bash
# Run all tests
npx vitest run

# Run a specific test file
npx vitest run tests/notes/note-service.test.ts

# Run in watch mode
npx vitest
```

## License

Proprietary — Physio Note Finisher
