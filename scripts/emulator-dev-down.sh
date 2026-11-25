#!/usr/bin/env bash

set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-3000}"
METRO_PORT="${METRO_PORT:-8081}"
APP_ID="${APP_ID:-com.murtazasaifee.physionotefinisher.debug}"

BACKEND_PID_FILE="${BACKEND_PID_FILE:-/tmp/physio-emulator-backend.pid}"
METRO_PID_FILE="${METRO_PID_FILE:-/tmp/physio-emulator-metro.pid}"
EMULATOR_PID_FILE="${EMULATOR_PID_FILE:-/tmp/physio-emulator.pid}"

log() {
  printf '[emulator-dev-down] %s\n' "$1"
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

detect_emulator_serial() {
  adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}'
}

main() {
  command -v adb >/dev/null 2>&1 || {
    echo "[emulator-dev-down] ERROR: missing command: adb" >&2
    exit 1
  }
  command -v lsof >/dev/null 2>&1 || {
    echo "[emulator-dev-down] ERROR: missing command: lsof" >&2
    exit 1
  }

  kill_pid_file_if_alive "$BACKEND_PID_FILE"
  kill_pid_file_if_alive "$METRO_PID_FILE"
  kill_port_listener_if_any "$BACKEND_PORT"
  kill_port_listener_if_any "$METRO_PORT"

  local serial
  serial="$(detect_emulator_serial)"
  if [[ -n "$serial" ]]; then
    adb -s "$serial" reverse --remove-all >/dev/null 2>&1 || true
    adb -s "$serial" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  fi

  kill_pid_file_if_alive "$EMULATOR_PID_FILE"

  log "Stopped emulator stack on ports ${BACKEND_PORT} and ${METRO_PORT}"
}

main "$@"
