#!/usr/bin/env bash
# Morning-of sanity check. Run this before you leave the house, and again
# at the venue once you're on their wifi.
#   bash ~/qimmune-hackathon/preflight.sh
export PATH=/opt/homebrew/bin:$PATH
cd "$(dirname "$0")" || exit 1
ok=0; fail=0
chk(){ if eval "$2" >/dev/null 2>&1; then echo "  ok   $1"; ok=$((ok+1)); else echo "  FAIL $1"; fail=$((fail+1)); fi; }

echo "Sentinel preflight"
echo
echo "toolchain"
chk "node installed"            "command -v node"
chk "npm installed"             "command -v npm"
chk "deps installed"            "test -d app/node_modules"
chk "medplum source reference"  "test -d medplum-src/examples"
chk "vitest installed"          "test -d app/node_modules/vitest"
chk "tests run clean"           "(cd app && npm test --silent)"
chk "ASTCT paper offline"       "test -s reference/ASTCT-consensus-grading-Lee-2019.md"

echo
echo "config"
chk "app/.env exists"           "test -f app/.env"
chk "deepgram key set"          "grep -q '^DEEPGRAM_API_KEY=.\{20,\}' app/.env"
chk "project id set"            "grep -q '^MEDPLUM_PROJECT_ID=.\{10,\}' app/.env"
chk "practitioner id set"       "grep -q '^MEDPLUM_PRACTITIONER_ID=.\{10,\}' app/.env"
chk ".env NOT tracked by git"   "! git ls-files --error-unmatch app/.env"

echo
echo "network (re-run this on venue wifi)"
chk "medplum api reachable"     "curl -sf -m 10 -o /dev/null https://api.medplum.com/healthcheck"
chk "deepgram reachable"        "curl -sf -m 10 -o /dev/null https://api.deepgram.com/v1/projects -H \"Authorization: Token \$(grep '^DEEPGRAM_API_KEY=' app/.env | cut -d= -f2 | tr -d ' ')\""

echo
echo "$ok passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  echo
  echo "Something's off. Don't debug alone at the venue --"
  echo "Medplum and Deepgram staff are both there. Ask early."
  exit 1
fi
echo
echo "All good. Start the app with:  cd app && npm run dev"
