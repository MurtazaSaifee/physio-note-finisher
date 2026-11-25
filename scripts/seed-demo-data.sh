#!/usr/bin/env bash
# Reset the demo clinic's patients/sessions/calendar to realistic synthetic data.
# Local database only. Takes a pg_dump backup first.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_EMAIL="${DEMO_EMAIL:-clinician@example.com}"

set -a; source "$ROOT_DIR/backend/.env"; set +a
case "${DATABASE_URL:-}" in
  *@localhost:*|*@127.0.0.1:*|postgresql://localhost:*|postgresql://127.0.0.1:*) ;;
  *) echo "Refusing: DATABASE_URL is not local." >&2; exit 1 ;;
esac
PATH="$(brew --prefix postgresql@18)/bin:$PATH"

BACKUP="$HOME/physio-demo-backup-$(date +%Y%m%d-%H%M%S).dump"
pg_dump -Fc "$DATABASE_URL" -f "$BACKUP"
echo "Backup: $BACKUP (restore with: pg_restore --clean --if-exists -d \"\$DATABASE_URL\" $BACKUP)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v demo_email="$DEMO_EMAIL" -f "$ROOT_DIR/backend/prisma/demo-data.sql"
