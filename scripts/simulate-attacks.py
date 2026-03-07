"""
simulate-attacks.py — Fire realistic attack payloads at the backend
Uses real HMAC signatures so all requests pass the zero-trust boundary.

Usage:
    python scripts/simulate-attacks.py
"""

import hmac
import hashlib
import time
import json
import random
import urllib.request
import urllib.error
import os
import sys

API_BASE = "http://127.0.0.1:8000"
# Outer HMAC secret — matches API_SECRET used by verify_hmac_signature in security.py
API_SECRET = os.getenv("API_SECRET", "SUPER_SECRET_HMAC_KEY_12345")

# ── HMAC helper ──────────────────────────────────────────────────────────────

def make_hmac_headers(body: str = "") -> dict:
    """Outer HMAC: HMAC-SHA256(API_SECRET, timestamp:body) — matches security.py verify_hmac_signature."""
    ts = str(int(time.time()))
    payload = f"{ts}:{body}"
    sig = hmac.new(API_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return {"X-BB-Signature": sig, "X-BB-Timestamp": ts}


def post(path: str, body: dict, extra_headers: dict | None = None) -> dict | None:
    body_str = json.dumps(body)
    headers = {
        "Content-Type": "application/json",
        **(extra_headers or {}),
        **make_hmac_headers(body_str),
    }
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body_str.encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"status": e.code, "error": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}


def flush():
    # Best-effort flush — ignore auth errors since we don't have a user token here
    body_str = json.dumps({})
    headers = {
        "Content-Type": "application/json",
        **make_hmac_headers(body_str),
    }
    req = urllib.request.Request(
        f"{API_BASE}/api/flush",
        data=body_str.encode(),
        headers=headers,
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass  # flush is best-effort


def delay(ms: int):
    time.sleep(ms / 1000)


# ── Attack definitions ───────────────────────────────────────────────────────

ATTACKS = [
    {
        "name": "1. SCRIPT KIDDIE — cURL /.env probe",
        "ua": "curl/8.4.0",
        "tier": "BOT",
        "score": 100,
        "path_probed": "/.env",
        "rpc": {"jsonrpc": "2.0", "method": "eth_getBalance", "params": ["0xDEAD", "latest"], "id": 1},
    },
    {
        "name": "2. MEV BOT — Python Requests rapid polling",
        "ua": "python-requests/2.32.0",
        "tier": "BOT",
        "score": 95,
        "path_probed": "/api/rpc",
        "rpc": {
            "jsonrpc": "2.0",
            "method": "eth_sendTransaction",
            "params": [{"from": "0xAtt4ck3r000", "to": "0xBaitWallet001", "value": "0xDE0B6B3A7640000"}],
            "id": 2,
        },
    },
    {
        "name": "3. WALLET DRAINER — Headless Chromium DOM scraper",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HeadlessChrome/122.0.0.0 Safari/537.36",
        "tier": "BOT",
        "score": 98,
        "path_probed": "/vault",
        "rpc": {
            "jsonrpc": "2.0",
            "method": "eth_sendTransaction",
            "params": [{"from": "0xDrainer", "to": "0xVictimVault", "value": "0x8AC7230489E80000"}],  # 10 ETH
            "id": 3,
        },
    },
    {
        "name": "4. ADMIN BRUTE-FORCE — /admin path traversal probe",
        "ua": "Nikto/2.1.6",
        "tier": "BOT",
        "score": 100,
        "path_probed": "/admin",
        "rpc": {"jsonrpc": "2.0", "method": "eth_call", "params": [{"to": "0xConfigContract"}, "latest"], "id": 4},
    },
    {
        "name": "5. STEALTH SCRAPER — Spoofed Chrome fingerprint",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
        "tier": "SUSPICIOUS",
        "score": 72,
        "path_probed": "/ledger",
        "rpc": {"jsonrpc": "2.0", "method": "eth_getLogs", "params": [{"fromBlock": "0x0", "toBlock": "latest"}], "id": 5},
    },
]

# ── Main loop ────────────────────────────────────────────────────────────────

def run():
    sep = "═" * 66
    print(sep)
    print("  BHOOL BHULAIYAA — LIVE ATTACK SIMULATOR")
    print(f"  Target: {API_BASE}  |  Attacks: {len(ATTACKS)}")
    print(sep + "\n")

    for i, atk in enumerate(ATTACKS):
        session_id = f"sim-{int(time.time())}-{random.randint(1000,9999)}"
        ip = f"10.{random.randint(10,99)}.{random.randint(1,254)}.{random.randint(1,254)}"

        print(f"[FIRING] {atk['name']}")
        print(f"         UA     : {atk['ua'][:70]}")
        print(f"         Tier   : {atk['tier']}  Score: {atk['score']}")
        print(f"         IP     : {ip}  Session: {session_id}")

        extra = {
            "User-Agent": atk["ua"],
            "X-BB-Tier": atk["tier"],
            "X-BB-Threat-Score": str(atk["score"]),
            "X-BB-Session": session_id,
            "X-Forwarded-For": ip,
            "X-Path-Probed": atk["path_probed"],
        }

        result = post("/api/rpc", atk["rpc"], extra)
        print(f"         Result : {json.dumps(result)[:120]}\n")
        flush()
        delay(1200)

    print(sep)
    print("  All attack payloads fired. Check the dashboard → Tactical Overview.")
    print(sep)


if __name__ == "__main__":
    run()
