# API image for the Docker-only demo (`docker compose up`).
# Local mode: zero API keys, demo voice providers, files stored in the container.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/
COPY shared/package.json shared/
COPY mobile/package.json mobile/
RUN npm ci --workspace backend --workspace shared --no-audit --no-fund

COPY shared/ shared/
COPY backend/ backend/
# Same defaults as `npm run setup`. Values set by docker-compose take precedence.
RUN cp backend/.env.example backend/.env \
  && npm --workspace backend run prisma:generate

WORKDIR /app/backend
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && npm start"]
