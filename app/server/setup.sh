#!/usr/bin/env bash
# Interactive setup. Values you type go straight into server/.env on this
# machine — they are never printed, never committed, never leave your laptop.
set -euo pipefail
cd "$(dirname "$0")"

ask() { # ask VAR "prompt" [default]
  local var=$1 prompt=$2 default=${3:-} value
  if [ -n "$default" ]; then read -r -p "$prompt [$default]: " value; value=${value:-$default}
  else read -r -p "$prompt: " value; fi
  printf '%s=%s\n' "$var" "$value" >> .env.tmp
}
asksecret() {
  local var=$1 prompt=$2 value
  read -r -s -p "$prompt: " value; echo
  printf '%s=%s\n' "$var" "$value" >> .env.tmp
}

rm -f .env.tmp
echo "Sentinel telephony setup"
echo "------------------------"
echo
echo "1. Twilio  (console.twilio.com)"
ask       TWILIO_ACCOUNT_SID    "   Account SID (starts AC...)"
ask       TWILIO_API_KEY_SID    "   API Key SID (starts SK...)"
asksecret TWILIO_API_KEY_SECRET "   API Key Secret (hidden)"
ask       TWILIO_FROM_NUMBER    "   Your Twilio number (+1...)"
echo
echo "2. Deepgram"
DG=$(grep '^DEEPGRAM_API_KEY=' ../.env 2>/dev/null | cut -d= -f2 | tr -d ' \r' || true)
if [ -n "$DG" ]; then echo "   Found the key already in app/.env — reusing it."; printf 'DEEPGRAM_API_KEY=%s\n' "$DG" >> .env.tmp
else asksecret DEEPGRAM_API_KEY "   Deepgram API key (hidden)"; fi
echo
echo "3. Medplum  (app.medplum.com -> Project Admin -> Client Applications -> new)"
ask       MEDPLUM_CLIENT_ID     "   Client ID"
asksecret MEDPLUM_CLIENT_SECRET "   Client Secret (hidden)"
echo
echo "4. Public URL — run 'ngrok http 8080' in another terminal first"
ask       PUBLIC_URL            "   ngrok https URL (e.g. https://abc123.ngrok-free.app)"

{ echo "PORT=8080"; echo "MEDPLUM_BASE_URL=https://api.medplum.com/"; cat .env.tmp; } > .env
rm -f .env.tmp
chmod 600 .env
echo
echo "Wrote server/.env (readable only by you)."
echo "Now run:  npm run telephony"
