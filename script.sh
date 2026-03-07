#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3}"
OLLAMA_MODE="${OLLAMA_MODE:-auto}" # auto | with-ollama | without-ollama

SESSION_ID="judge-honeypot-$(date +%s)"
ATTACKER_IP="198.51.100.$((RANDOM % 200 + 20))"

echo "Mode: ${OLLAMA_MODE}"
if [[ "${OLLAMA_MODE}" != "auto" && "${OLLAMA_MODE}" != "with-ollama" && "${OLLAMA_MODE}" != "without-ollama" ]]; then
  echo "FAIL: OLLAMA_MODE must be one of: auto, with-ollama, without-ollama"
  exit 2
fi

echo "[1/6] Checking backend health..."
curl -fsS "${BACKEND_URL}/api/health" >/dev/null
echo "      Backend is reachable at ${BACKEND_URL}"

OLLAMA_SERVER_REACHABLE=0
OLLAMA_MODEL_AVAILABLE=0

if curl -fsS "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
  OLLAMA_SERVER_REACHABLE=1
  TAGS_JSON="$(curl -fsS "${OLLAMA_URL}/api/tags")"
  if printf '%s' "${TAGS_JSON}" | grep -qi "${OLLAMA_MODEL}"; then
    OLLAMA_MODEL_AVAILABLE=1
  fi
fi

EFFECTIVE_MODE="without-ollama"
if [[ "${OLLAMA_MODE}" == "with-ollama" ]]; then
  EFFECTIVE_MODE="with-ollama"
elif [[ "${OLLAMA_MODE}" == "without-ollama" ]]; then
  EFFECTIVE_MODE="without-ollama"
else
  if [[ ${OLLAMA_SERVER_REACHABLE} -eq 1 && ${OLLAMA_MODEL_AVAILABLE} -eq 1 ]]; then
    EFFECTIVE_MODE="with-ollama"
  fi
fi

echo "[2/6] Checking Ollama readiness for selected mode..."
if [[ "${EFFECTIVE_MODE}" == "with-ollama" ]]; then
  if [[ ${OLLAMA_SERVER_REACHABLE} -ne 1 ]]; then
    echo "      FAIL: Ollama server not reachable at ${OLLAMA_URL}."
    echo "      Start it with: ollama serve"
    exit 2
  fi
  if [[ ${OLLAMA_MODEL_AVAILABLE} -ne 1 ]]; then
    echo "      FAIL: Model '${OLLAMA_MODEL}' not found."
    echo "      Run: ollama pull ${OLLAMA_MODEL}"
    exit 2
  fi
  echo "      PASS: with-ollama mode ready (${OLLAMA_MODEL})."
else
  echo "      Running without-ollama mode (fallback path allowed)."
fi

if [[ "${EFFECTIVE_MODE}" == "with-ollama" ]]; then
  echo "[3/6] Ollama loaded-models before traffic:"
  curl -sS "${OLLAMA_URL}/api/ps"
  echo
else
  echo "[3/6] Skipping pre-traffic Ollama model check in without-ollama mode."
fi

echo "[4/6] Sending BOT traffic through honeypot..."
echo "      Session=${SESSION_ID} IP=${ATTACKER_IP}"

curl -sS -X POST "${BACKEND_URL}/api/rpc" \
  -H 'Content-Type: application/json' \
  -H 'X-BB-Tier: BOT' \
  -H 'X-BB-Threat-Score: 100' \
  -H "X-BB-Session: ${SESSION_ID}" \
  -H "X-Forwarded-For: ${ATTACKER_IP}" \
  -H 'User-Agent: python-requests/2.31' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
echo

curl -sS -X POST "${BACKEND_URL}/api/rpc" \
  -H 'Content-Type: application/json' \
  -H 'X-BB-Tier: BOT' \
  -H 'X-BB-Threat-Score: 100' \
  -H "X-BB-Session: ${SESSION_ID}" \
  -H "X-Forwarded-For: ${ATTACKER_IP}" \
  -H 'User-Agent: python-requests/2.31' \
  -d '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":2}'
echo

if [[ "${EFFECTIVE_MODE}" == "with-ollama" ]]; then
  echo "[5/6] Ollama loaded-models after BOT traffic (should include ${OLLAMA_MODEL}):"
  PS_JSON="$(curl -fsS "${OLLAMA_URL}/api/ps")"
  printf '%s\n' "${PS_JSON}"
  if printf '%s' "${PS_JSON}" | grep -qi "${OLLAMA_MODEL}"; then
    echo "      PASS: Ollama model loaded after BOT traffic."
  else
    echo "      WARN: Model not shown in /api/ps. Backend may have used fallback for this run."
  fi
else
  echo "[5/6] without-ollama mode selected; backend is expected to use static fallback in BOT path."
fi

echo "[6/6] Flushing and extracting ledger evidence for simulated attacker IP..."
curl -sS -X POST "${BACKEND_URL}/api/flush" >/dev/null
LEDGER_JSON="$(curl -fsS "${BACKEND_URL}/api/ledger")"
LEDGER_FILE="$(mktemp)"
trap 'rm -f "${LEDGER_FILE}"' EXIT
printf '%s' "${LEDGER_JSON}" > "${LEDGER_FILE}"

python3 - "${ATTACKER_IP}" "${LEDGER_FILE}" <<'PY'
import json
import sys

ip = sys.argv[1]
ledger_path = sys.argv[2]

try:
  with open(ledger_path, "r", encoding="utf-8") as f:
    data = json.load(f)
except json.JSONDecodeError:
  print("      WARN: Ledger response was not valid JSON.")
  sys.exit(0)
except OSError as exc:
  print(f"      WARN: Could not read ledger file: {exc}")
  sys.exit(0)

if not data:
  print("      WARN: Empty ledger response.")
  sys.exit(0)

matches = [x for x in data.get("ledger", []) if x.get("ip") == ip]
if not matches:
  print(f"      WARN: No ledger entries found for simulated IP {ip}.")
  sys.exit(0)

print(f"      Found {len(matches)} ledger entr{'y' if len(matches) == 1 else 'ies'} for IP {ip}:")
for row in matches[:5]:
  print(
    "      "
    f"threat_id={row.get('threat_id')} | "
    f"attack_type={row.get('attack_type')} | "
    f"containment_mode={row.get('containment_mode')} | "
    f"status_label={row.get('status_label')} | "
    f"evidence_id={row.get('evidence_id')}"
  )
print(f"      Latest content_hash={matches[0].get('content_hash')}")
PY

echo
echo "Done."
if [[ "${EFFECTIVE_MODE}" == "with-ollama" ]]; then
  echo "Result: with-ollama verification path completed."
else
  echo "Result: without-ollama fallback verification path completed."
fi