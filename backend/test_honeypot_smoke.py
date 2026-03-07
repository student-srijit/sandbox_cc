#!/usr/bin/env python3
"""
End-to-end smoke tests for the FastAPI honeypot engine.

Usage:
  1) Start backend server: uvicorn main:app --port 8000
  2) Run this script:    python test_honeypot_smoke.py

Optional environment variables:
  HONEYPOT_BASE_URL=http://127.0.0.1:8000
  HONEYPOT_TIMEOUT_SECONDS=20
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

BASE_URL = os.getenv("HONEYPOT_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("HONEYPOT_TIMEOUT_SECONDS", "20"))


def _request(
    method: str,
    path: str,
    headers: Optional[Dict[str, str]] = None,
    body: Optional[str] = None,
) -> Tuple[int, str]:
    data = body.encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers=headers or {},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            payload = resp.read().decode("utf-8")
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        return exc.code, payload


def _post_rpc(headers: Dict[str, str], payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any], float]:
    merged_headers = {
        "Content-Type": "application/json",
        **headers,
    }
    start = time.perf_counter()
    status, text = _request("POST", "/api/rpc", headers=merged_headers, body=json.dumps(payload))
    elapsed = time.perf_counter() - start
    try:
        return status, json.loads(text), elapsed
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"/api/rpc returned non-JSON payload: {text}") from exc


def _get_json(path: str) -> Dict[str, Any]:
    status, text = _request("GET", path)
    if status != 200:
        raise RuntimeError(f"GET {path} failed with HTTP {status}: {text}")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GET {path} did not return JSON: {text}") from exc


def _error_code(response_obj: Dict[str, Any]) -> Optional[int]:
    error = response_obj.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        return int(code) if isinstance(code, int) else None
    return None


def _hex_to_int(value: Any) -> int:
    if not isinstance(value, str):
        raise ValueError(f"Expected hex string, got: {value!r}")
    if not value.startswith("0x"):
        raise ValueError(f"Expected 0x-prefixed hex string, got: {value!r}")
    return int(value, 16)


def main() -> int:
    failures = []
    total_checks = 0

    def check(condition: bool, name: str, details: str = "") -> None:
        nonlocal total_checks
        total_checks += 1
        if condition:
            print(f"[PASS] {name}")
            return
        fail_msg = f"[FAIL] {name}"
        if details:
            fail_msg += f" :: {details}"
        print(fail_msg)
        failures.append(fail_msg)

    print(f"Running honeypot smoke tests against: {BASE_URL}")

    # 0) Health check
    try:
        health = _get_json("/api/health")
        check(health.get("status") == "ok", "Health endpoint is reachable", str(health))
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] Health endpoint is reachable :: {exc}")
        return 1

    # 1) HUMAN tier should get realistic RPC failure response
    human_headers = {
        "X-BB-Tier": "HUMAN",
        "X-BB-Threat-Score": "10",
        "X-BB-Session": "smoke-human-session",
        "X-Forwarded-For": "198.51.100.10",
        "User-Agent": "Mozilla/5.0",
    }
    _, human_resp, _ = _post_rpc(
        headers=human_headers,
        payload={"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1},
    )
    check(_error_code(human_resp) == -32601, "HUMAN tier returns method-not-found behavior", str(human_resp))

    # 2) SUSPICIOUS tier should delay and use static library
    suspicious_headers = {
        "X-BB-Tier": "SUSPICIOUS",
        "X-BB-Threat-Score": "50",
        "X-BB-Session": "smoke-suspicious-session",
        "X-Forwarded-For": "198.51.100.11",
        "User-Agent": "curl/8.0",
    }
    _, suspicious_resp, suspicious_elapsed = _post_rpc(
        headers=suspicious_headers,
        payload={"jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 2},
    )
    check(suspicious_resp.get("result") == "0x1", "SUSPICIOUS tier serves static RPC response", str(suspicious_resp))
    check(suspicious_elapsed >= 0.75, "SUSPICIOUS tier applies response delay", f"elapsed={suspicious_elapsed:.3f}s")

    # 3) BOT tier should return plausible RPC values for non-blocked methods
    bot_headers = {
        "X-BB-Tier": "BOT",
        "X-BB-Threat-Score": "100",
        "X-BB-Session": f"smoke-bot-session-{int(time.time() * 1000)}",
        "X-Forwarded-For": "198.51.100.12",
        "User-Agent": "python-requests/2.31",
    }
    _, bot_nonce_resp, _ = _post_rpc(
        headers=bot_headers,
        payload={
            "jsonrpc": "2.0",
            "method": "eth_getTransactionCount",
            "params": ["0xAttacker", "latest"],
            "id": 3,
        },
    )
    _, bot_chain_resp, _ = _post_rpc(
        headers=bot_headers,
        payload={
            "jsonrpc": "2.0",
            "method": "eth_chainId",
            "params": [],
            "id": 4,
        },
    )

    try:
        _hex_to_int(bot_nonce_resp.get("result"))
        check(True, "BOT tier returns hex nonce", str(bot_nonce_resp))
    except Exception as exc:  # noqa: BLE001
        check(False, "BOT tier returns hex nonce", str(exc))

    check(_error_code(bot_chain_resp) != -32603, "BOT tier does not hit internal-tier fallback", str(bot_chain_resp))
    check(bot_nonce_resp.get("id") == 3, "BOT nonce response preserves request id", str(bot_nonce_resp))
    check(bot_chain_resp.get("id") == 4, "BOT chainId response preserves request id", str(bot_chain_resp))

    # 4) EXPLOIT alias should be treated as BOT (not fall into internal-tier error)
    exploit_headers = {
        "X-BB-Tier": "EXPLOIT",
        "X-BB-Threat-Score": "100",
        "X-BB-Session": f"smoke-exploit-session-{int(time.time() * 1000)}",
        "X-Forwarded-For": "198.51.100.13",
        "User-Agent": "Playwright",
    }
    _, exploit_resp, _ = _post_rpc(
        headers=exploit_headers,
        payload={"jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 6},
    )
    check(_error_code(exploit_resp) != -32603, "EXPLOIT tier no longer falls into internal-tier error", str(exploit_resp))

    # 5) High-risk BOT payload should auto-contain (quarantine), then persist on next request
    quarantine_headers = {
        "X-BB-Tier": "BOT",
        "X-BB-Threat-Score": "100",
        "X-BB-Session": f"smoke-quarantine-session-{int(time.time() * 1000)}",
        "X-Forwarded-For": "198.51.100.14",
        "User-Agent": "Go-http-client/2.0",
    }
    _, quarantine_first_resp, _ = _post_rpc(
        headers=quarantine_headers,
        payload={
            "jsonrpc": "2.0",
            "method": "eth_sendTransaction",
            "params": [{"from": "0x1", "to": "0x2", "value": "0x1"}],
            "id": 7,
        },
    )
    _, quarantine_second_resp, _ = _post_rpc(
        headers=quarantine_headers,
        payload={"jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 8},
    )
    check(quarantine_first_resp.get("result") is None, "Auto-containment quarantines high-risk request", str(quarantine_first_resp))
    check(quarantine_second_resp.get("result") is None, "Quarantine persists for subsequent requests", str(quarantine_second_resp))

    # 6) Static probe should serve fake .env bait content
    env_headers = {
        "X-BB-Tier": "HUMAN",
        "X-BB-Session": f"smoke-env-session-{int(time.time() * 1000)}",
        "X-Forwarded-For": "198.51.100.15",
        "User-Agent": "curl/8.0",
    }
    status, env_text = _request("GET", "/.env", headers=env_headers)
    check(status == 200, "Static probe endpoint returns 200 for /.env", f"status={status}")
    check("HOT_WALLET_PRIVATE_KEY" in env_text, "Static probe returns fake .env bait data")

    print("\nSummary")
    print(f"  Total checks: {total_checks}")
    print(f"  Failures: {len(failures)}")

    if failures:
        print("\nFailed checks:")
        for line in failures:
            print(f"  - {line}")
        return 1

    print("All honeypot smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
