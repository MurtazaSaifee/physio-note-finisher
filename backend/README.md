# Backend

Fastify API and Prisma/PostgreSQL persistence for the local Physio Note Finisher showcase.

## Setup

From the repository root:

```bash
npm ci
cp backend/.env.example backend/.env
npm run local:setup
npm run dev
```

`local:setup` starts PostgreSQL 16 in Docker, applies `backend/prisma/migrations` and runs the synthetic seed.

## Environment

`backend/.env.example` is the authoritative template. The required groups are:

- PostgreSQL: `DATABASE_URL`
- Authentication: distinct JWT secrets, token lifetimes, bcrypt cost and rate limits
- Local server: `APP_ENV=local`, `NODE_ENV`, `PORT`
- Sarvam: `SARVAM_API_KEY` and optional model names
- Optional local retention scheduler settings

Sarvam is the only external API integration. Files are stored beneath `LOCAL_STORAGE_DIR` or `backend/tmp`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm --workspace backend run dev` | Start the local API with file watching |
| `npm --workspace backend run prisma:generate` | Generate the Prisma client |
| `npm --workspace backend run prisma:migrate:deploy` | Apply committed migrations |
| `npm --workspace backend run prisma:seed` | Seed synthetic demonstration data |
| `npm --workspace backend run lint` | Run ESLint |
| `npm --workspace backend run typecheck` | Generate Prisma and run TypeScript checking |
| `npm --workspace backend test` | Run backend Vitest tests |

## Source layout

```text
src/
├── api/              Fastify routes and middleware
├── config/           Runtime environment parsing
├── data/             Prisma client and repositories
├── domain/           Auth, patients, sessions, notes, exports and voice logic
├── infrastructure/   Contained local file storage
├── observability/    Structured logger
├── workers/          In-process voice, export and retention work
├── index.ts          Local development entrypoint
└── server.ts         Injectable Fastify server builder
```

Copyright © 2026. All rights reserved.
