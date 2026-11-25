#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AVD_NAME="${AVD_NAME:-physio_pixel_7_api_35}"
APP_ID="${APP_ID:-com.murtazasaifee.physionotefinisher.debug}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
METRO_PORT="${METRO_PORT:-8081}"

BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/physio-emulator-backend.pid}"
METRO_PID_FILE="${METRO_PID_FILE:-/tmp/physio-emulator-metro.pid}"
EMULATOR_PID_FILE="${EMULATOR_PID_FILE:-/tmp/physio-emulator.pid}"
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-/tmp/physio-emulator-backend.log}"
METRO_LOG_FILE="${METRO_LOG_FILE:-/tmp/physio-emulator-metro.log}"
EMULATOR_LOG_FILE="${EMULATOR_LOG_FILE:-/tmp/physio-emulator.log}"
ADB_BIN=""

log() {
  printf '[emulator-dev-up] %s\n' "$1" >&2
}

fail() {
  printf '[emulator-dev-up] ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

detect_lan_ip() {
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [[ -z "$ip" ]]; then
    ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  [[ -n "$ip" ]] || fail "Could not detect Mac LAN IP."
  printf '%s\n' "$ip"
}

write_env_file() {
  local api_base_url="$1"
  local env_file="${ROOT_DIR}/mobile/.env.local"
  cat >"$env_file" <<EOF
EXPO_PUBLIC_API_BASE_URL=${api_base_url}
EOF
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="$2"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    if curl -fsS -m 3 "$url" >/dev/null 2>&1; then
      return 0
    fi

    if (( "$(date +%s)" - start_ts >= timeout_seconds )); then
      return 1
    fi
    sleep 1
  done
}

wait_for_boot_completed() {
  local serial="$1"
  local timeout_seconds="${2:-180}"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    local boot_completed
    boot_completed="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$boot_completed" == "1" ]]; then
      return 0
    fi

    if (( "$(date +%s)" - start_ts >= timeout_seconds )); then
      return 1
    fi
    sleep 2
  done
}

detect_emulator_serial() {
  adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}'
}

kill_pid_file_if_alive() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

kill_port_listener_if_any() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      kill "$pid" >/dev/null 2>&1 || true
    done <<<"$pids"
  fi
}

is_local_database_url() {
  local url="$1"
  case "$url" in
    file:*|sqlite:*|sqlite://*) return 0 ;;
    postgresql://localhost:*|postgresql://127.0.0.1:*|postgres://localhost:*|postgres://127.0.0.1:*) return 0 ;;
    postgresql://*@localhost:*|postgresql://*@127.0.0.1:*|postgres://*@localhost:*|postgres://*@127.0.0.1:*) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_database() {
  local pg_bin
  pg_bin="$(brew --prefix postgresql@18 2>/dev/null || true)/bin"
  [[ -x "${pg_bin}/pg_isready" ]] && PATH="${pg_bin}:${PATH}"
  require_cmd pg_isready

  if ! pg_isready -q; then
    log "Starting Postgres via brew services"
    brew services start postgresql@18 >/dev/null 2>&1 || fail "Could not start postgresql@18"
    local i
    for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
    pg_isready -q || fail "Postgres did not become ready"
  fi

  if ! psql "$DATABASE_URL" -qc 'select 1' >/dev/null 2>&1; then
    local db_name="${DATABASE_URL##*/}"
    db_name="${db_name%%\?*}"
    log "Creating database ${db_name}"
    createdb "$db_name" || fail "Could not create database ${db_name}"
  fi

  log "Applying Prisma migrations"
  (cd "$ROOT_DIR" && npx prisma migrate deploy \
    --config backend/prisma.config.ts --schema backend/prisma/schema.prisma >/dev/null) \
    || fail "prisma migrate deploy failed (run it by hand to see the error)"
}

ensure_emulator_device() {
  local serial
  serial="$(detect_emulator_serial)"
  if [[ -n "$serial" ]]; then
    wait_for_boot_completed "$serial" 180 || fail "Emulator ${serial} did not finish booting"
    printf '%s\n' "$serial"
    return 0
  fi

  log "Launching emulator: ${AVD_NAME}"
  nohup emulator -adb-path "$ADB_BIN" -avd "$AVD_NAME" >"$EMULATOR_LOG_FILE" 2>&1 &
  echo $! >"$EMULATOR_PID_FILE"

  local start_ts
  start_ts="$(date +%s)"
  while true; do
    serial="$(detect_emulator_serial)"
    if [[ -n "$serial" ]]; then
      wait_for_boot_completed "$serial" 180 || fail "Emulator ${serial} did not finish booting"
      printf '%s\n' "$serial"
      return 0
    fi

    if (( "$(date +%s)" - start_ts >= 180 )); then
      fail "Emulator did not appear in adb devices"
    fi
    sleep 2
  done
}

main() {
  require_cmd adb
  require_cmd curl
  require_cmd ipconfig
  require_cmd lsof
  require_cmd npm
  require_cmd emulator
  ADB_BIN="$(command -v adb)"

  if [[ -f "$ROOT_DIR/backend/.env" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$ROOT_DIR/backend/.env"
    set +a
  fi

  if ! is_local_database_url "${DATABASE_URL:-}"; then
    fail "Refusing emulator dev stack because DATABASE_URL is not localhost/127.0.0.1/file."
  fi

  # Local voice transcription shells out to the Spokenly CLI, which needs the app running.
  if [[ -d /Applications/Spokenly.app ]] && ! pgrep -xq Spokenly; then
    log "Launching Spokenly (local speech-to-text)"
    open -a Spokenly
  fi

  ensure_database

  local serial
  serial="$(ensure_emulator_device)"
  log "Using emulator: ${serial}"

  kill_pid_file_if_alive "$BACKEND_PID_FILE"
  kill_pid_file_if_alive "$METRO_PID_FILE"
  kill_port_listener_if_any "$BACKEND_PORT"
  kill_port_listener_if_any "$METRO_PORT"

  log "Starting backend on port ${BACKEND_PORT}"
  (
    cd "$ROOT_DIR"
    nohup npm --workspace backend run start >"$BACKEND_LOG_FILE" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )

  wait_for_http "http://127.0.0.1:${BACKEND_PORT}/health" 45 || {
    tail -n 80 "$BACKEND_LOG_FILE" >&2 || true
    fail "Backend healthcheck failed on port ${BACKEND_PORT}"
  }

  local api_base_url
  api_base_url="http://localhost:${BACKEND_PORT}"

  log "Starting Metro on port ${METRO_PORT}"
  (
    cd "$ROOT_DIR"
    # Node 25 resolves "localhost" to ::1 first; adb reverse needs IPv4 (127.0.0.1).
    NODE_OPTIONS="--dns-result-order=ipv4first ${NODE_OPTIONS:-}" \
    EXPO_PUBLIC_API_BASE_URL="$api_base_url" \
      nohup npm --workspace mobile run start -- --host localhost --port "$METRO_PORT" --clear \
      >"$METRO_LOG_FILE" 2>&1 &
    echo $! >"$METRO_PID_FILE"
  )

  wait_for_http "http://localhost:${METRO_PORT}" 60 || {
    tail -n 120 "$METRO_LOG_FILE" >&2 || true
    fail "Metro failed to start on port ${METRO_PORT}"
  }

  log "Configuring adb reverse"
  local attempt
  for attempt in 1 2 3 4 5; do
    adb -s "$serial" reverse tcp:"$METRO_PORT" tcp:"$METRO_PORT" \
      && adb -s "$serial" reverse tcp:"$BACKEND_PORT" tcp:"$BACKEND_PORT" && break
    log "adb reverse failed (attempt ${attempt}), retrying"
    sleep 3
  done

  local reverse_map
  reverse_map="$(adb -s "$serial" reverse --list || true)"
  grep -q "tcp:${METRO_PORT} tcp:${METRO_PORT}" <<<"$reverse_map" || fail "adb reverse for Metro missing"
  grep -q "tcp:${BACKEND_PORT} tcp:${BACKEND_PORT}" <<<"$reverse_map" || fail "adb reverse for backend missing"

  if adb -s "$serial" shell pm list packages | grep -q "package:${APP_ID}"; then
    log "Emulator is ready for Maestro against ${APP_ID}"
  else
    fail "App package ${APP_ID} is not installed on the emulator. Install the dev build before running Maestro."
  fi

  adb -s "$serial" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  adb -s "$serial" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

  write_env_file "$api_base_url"

  printf '\n[emulator-dev-up] Ready\n'
  printf '  Device:         %s\n' "$serial"
  printf '  App package:    %s\n' "$APP_ID"
  printf '  API base URL:   %s\n' "$api_base_url"
  printf '  Backend health:  http://127.0.0.1:%s/health\n' "$BACKEND_PORT"
  printf '  Metro:          http://localhost:%s\n' "$METRO_PORT"
  printf '  Emulator log:    %s\n' "$EMULATOR_LOG_FILE"
  printf '  Backend log:     %s\n' "$BACKEND_LOG_FILE"
  printf '  Metro log:       %s\n' "$METRO_LOG_FILE"
}

main "$@"
