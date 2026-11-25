#!/usr/bin/env bash
# Walks the core clinical flow against a local API with zero API keys:
# sign in → patient → session → consent → voice upload → transcript
# → SOAP draft → patient summary → finalize → PDF export → tenant isolation.
#
#   docker compose up --build -d --wait   (or: npm run setup && npm run dev)
#   scripts/api-tour.sh
#
# Requires curl and jq. docs/api-tour.md explains each step.
set -euo pipefail

API="${API:-http://localhost:3000}"
EMAIL="${LOGIN_EMAIL:-clinician@example.com}"
PASSWORD="${LOGIN_PASSWORD:-password123}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
call() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "$API$path" -H "authorization: Bearer $TOKEN" -H "x-clinic-id: $CLINIC")
  if [[ -n "$body" ]]; then args+=(-H 'content-type: application/json' --data "$body"); fi
  curl "${args[@]}"
}

step "1. Sign in (access + rotating refresh token)"
LOGIN=$(curl -sS -X POST "$API/api/v1/auth/login" -H 'content-type: application/json' \
  --data "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email: $e, password: $p}')")
TOKEN=$(jq -r '.accessToken' <<<"$LOGIN")
CLINIC=$(jq -r '.user.clinicId' <<<"$LOGIN")
[[ "$TOKEN" != "null" ]] || { echo "Sign-in failed: $LOGIN"; exit 1; }
echo "signed in to $CLINIC"

step "2. Pick a seeded patient"
PATIENT=$(call GET "/api/v1/patients" | jq -r '.data.items[0].id')
echo "patient $PATIENT"

step "3. Open a draft session"
SESSION=$(call POST "/api/v1/patients/$PATIENT/sessions" \
  "$(jq -n --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{startedAt: $t, visitType: "Follow-up", noteStatus: "draft"}')" \
  | jq -r '.data.id')
echo "session $SESSION"

step "4. Record AI-processing consent (audio is refused without it)"
call POST "/api/v1/voice/consents" "$(jq -n --arg p "$PATIENT" '{patientId: $p, consentTextVersion: "v1-2026"}')" \
  | jq -c '.data | {type, status, consentTextVersion}'

step "5. Upload a voice recap: start → send bytes → complete"
head -c 4096 /dev/urandom >"$WORK/recap.m4a" # any bytes: the local demo STT returns a fixed recap
UPLOAD=$(call POST "/api/v1/voice/uploads" "$(jq -n --arg c "$CLINIC" --arg p "$PATIENT" \
  '{clinicId: $c, patientId: $p, mimeType: "audio/m4a", fileName: "recap.m4a", fileSizeBytes: 4096, durationSeconds: 30}')")
UPLOAD_ID=$(jq -r '.data.uploadId' <<<"$UPLOAD")
STORAGE_KEY=$(jq -r '.data.storageKey' <<<"$UPLOAD")
curl -sS -f -X PUT "$API$(jq -r '.data.uploadUrl' <<<"$UPLOAD")" -H "authorization: Bearer $TOKEN" \
  -H "x-clinic-id: $CLINIC" -H 'content-type: audio/m4a' --data-binary @"$WORK/recap.m4a" >/dev/null
JOB=$(call POST "/api/v1/voice/uploads/$UPLOAD_ID/complete" "$(jq -n --arg c "$CLINIC" --arg p "$PATIENT" \
  --arg u "$UPLOAD_ID" --arg k "$STORAGE_KEY" '{clinicId: $c, patientId: $p, uploadId: $u, storageKey: $k, durationSeconds: 30}')" \
  | jq -r '.data.transcriptionJobId')
echo "stored at $STORAGE_KEY"
echo "voice job $JOB"

step "6. Wait for transcription"
for _ in $(seq 1 30); do
  STATUS=$(call GET "/api/v1/voice/jobs/$JOB" | jq -r '.data.status')
  [[ "$STATUS" == "succeeded" || "$STATUS" == "failed" ]] && break
  sleep 1
done
echo "job $STATUS"
TEXT=$(call GET "/api/v1/voice/jobs/$JOB/transcript" | jq -r '.data.text')
echo "transcript: ${TEXT:0:150}…"

step "7. Draft the SOAP note from the transcript"
call POST "/api/v1/voice/soap/generate" "$(jq -n --arg p "$PATIENT" --arg s "$SESSION" --arg t "$TEXT" \
  '{patientId: $p, sessionId: $s, transcriptText: $t}')" | jq '.data.sections'

step "8. Draft the patient-friendly summary"
call POST "/api/v1/voice/summary/generate" "$(jq -n --arg p "$PATIENT" --arg s "$SESSION" '{patientId: $p, sessionId: $s}')" \
  | jq -r '.data.patientSummary'

step "9. Finalize (locked until deliberately reopened)"
call POST "/api/v1/patients/$PATIENT/sessions/$SESSION/note/finalize" '{}' | jq -c '.data | {noteStatus}'

step "10. Export the full note as a PDF"
EXPORT_ID=$(call POST "/api/v1/patients/$PATIENT/sessions/$SESSION/export-records" \
  '{"action":"saved","type":"fullNote","format":"pdf"}' | jq -r '.data.id')
for _ in $(seq 1 30); do
  FILE_STATUS=$(call GET "/api/v1/patients/$PATIENT/sessions/$SESSION/exports/$EXPORT_ID" | jq -r '.data.fileStatus')
  [[ "$FILE_STATUS" == "succeeded" || "$FILE_STATUS" == "failed" ]] && break
  sleep 1
done
DOWNLOAD=$(call POST "/api/v1/patients/$PATIENT/sessions/$SESSION/exports/$EXPORT_ID/download" '{}' | jq -r '.data.downloadUrl')
curl -sS -f "$API$DOWNLOAD" -H "authorization: Bearer $TOKEN" -H "x-clinic-id: $CLINIC" -o "$WORK/note.pdf"
cp "$WORK/note.pdf" ./physio-note-export.pdf
echo "saved ./physio-note-export.pdf ($(wc -c <"$WORK/note.pdf" | tr -d ' ') bytes)"

step "11. Tenant isolation: a path that escapes this clinic is refused"
ESCAPE="/api/v1/storage/download/clinics%2F$CLINIC%2F..%2Fanother-clinic%2Fnote.pdf"
curl -sS -o /dev/null -w "GET …/clinics/$CLINIC/../another-clinic/note.pdf → HTTP %{http_code}\n" \
  "$API$ESCAPE" -H "authorization: Bearer $TOKEN" -H "x-clinic-id: $CLINIC"

printf '\nDone. Sign in to the app as %s to see this session on the patient timeline.\n' "$EMAIL"
