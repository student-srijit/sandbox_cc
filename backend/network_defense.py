"""
network_defense.py — Network-Layer Active Defense Middleware
============================================================
Three independent passive-defense mechanisms that plug into FastAPI's
ASGI middleware stack and feed directly into the existing ContainmentOrchestrator:

  1. Per-IP sliding-window rate limiter
     • Tracks request counts per IP in a 60-second rolling window.
     • After RATE_LIMIT_THRESHOLD (default 90) requests/60s:  TAR_PIT
     • After RATE_LIMIT_BAN_MULTIPLIER × threshold:           SHADOW_BAN

  2. Login brute-force lockout
     • Intercepts POST /api/auth/login responses from downstream.
     • Tracks per-IP failed-login counts within LOGIN_WINDOW_SECONDS (default 120).
     • After LOGIN_SOFT_LIMIT (default 5) failures:  progressive tar-pit delay (1s × attempts)
     • After LOGIN_HARD_LIMIT (default 10) failures: auto SHADOW_BAN + lock-out header

  3. Directory/path scan detector
     • Any 404 (or canary-path hit) from an IP that hits 8+ distinct unknown paths
       within SCAN_WINDOW_SECONDS (default 60) triggers TAR_PIT escalation
       and auto-contain as a SCANNER.
     • Known-good path prefixes (API, assets) are whitelisted so the frontend
       never triggers this.

All three mechanisms are purely defensive (no outbound connections, no payload
injection). They only add headers, delays, or feed into the ContainmentOrchestrator
which already handles the actual response manipulation.

Thread safety: all mutable state uses threading.Lock so this is safe under
Uvicorn's multi-threaded workers.
"""

import asyncio
import ipaddress
import logging
import os
import threading
import time
from collections import defaultdict, deque
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, StreamingResponse
from starlette.types import ASGIApp

logger = logging.getLogger("bhool-bhulaiyaa.network_defense")

# ---------------------------------------------------------------------------
# Configuration — all tuneable via env vars
# ---------------------------------------------------------------------------

RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_THRESHOLD = int(os.getenv("RATE_LIMIT_THRESHOLD", "90"))    # req/window before tar-pit
RATE_LIMIT_BAN_THRESHOLD = RATE_LIMIT_THRESHOLD * int(os.getenv("RATE_LIMIT_BAN_MULTIPLIER", "3"))

LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "120"))
LOGIN_SOFT_LIMIT = int(os.getenv("LOGIN_SOFT_LIMIT", "5"))   # failed logins → slow down
LOGIN_HARD_LIMIT = int(os.getenv("LOGIN_HARD_LIMIT", "10"))  # failed logins → ban

SCAN_WINDOW_SECONDS = int(os.getenv("SCAN_WINDOW_SECONDS", "60"))
SCAN_PATH_THRESHOLD = int(os.getenv("SCAN_PATH_THRESHOLD", "8"))  # distinct 404s/window → scanner

# Paths that are expected and should never count toward the scan detector
# (Next.js assets, API routes the frontend legitimately uses)
SCAN_WHITELIST_PREFIXES = (
    "/api/",
    "/_next/",
    "/favicon",
    "/fonts/",
    "/fallback",
    "/pow-worker",
    "/telemetry",
    "/public/",
)

# IPs that are never rate-limited (loopback, link-local)
ALWAYS_ALLOW_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]


def _is_internal(ip: str) -> bool:
    """Returns True for loopback / RFC-1918 addresses that should never be penalised."""
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in net for net in ALWAYS_ALLOW_NETWORKS)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# 1. Sliding-window rate limiter state
# ---------------------------------------------------------------------------

_rate_timestamps: dict[str, deque] = defaultdict(deque)
_rate_lock = threading.Lock()


def _record_request(ip: str) -> int:
    """Adds a timestamp for this request; returns the current count within the window."""
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    with _rate_lock:
        dq = _rate_timestamps[ip]
        dq.append(now)
        # Prune the left (old) side
        while dq and dq[0] < cutoff:
            dq.popleft()
        return len(dq)


# ---------------------------------------------------------------------------
# 2. Login failure tracker
# ---------------------------------------------------------------------------

_login_failures: dict[str, list[float]] = defaultdict(list)  # ip → [timestamp, ...]
_login_lock = threading.Lock()


def _record_login_failure(ip: str) -> int:
    """Records a failed login attempt; returns the current failure count within the window."""
    now = time.time()
    cutoff = now - LOGIN_WINDOW_SECONDS
    with _login_lock:
        failures = _login_failures[ip]
        failures.append(now)
        # Prune old failures
        _login_failures[ip] = [t for t in failures if t >= cutoff]
        return len(_login_failures[ip])


def _get_login_failure_count(ip: str) -> int:
    now = time.time()
    cutoff = now - LOGIN_WINDOW_SECONDS
    with _login_lock:
        return len([t for t in _login_failures[ip] if t >= cutoff])


# ---------------------------------------------------------------------------
# 3. Path scan detector state
# ---------------------------------------------------------------------------

_scan_paths: dict[str, dict] = defaultdict(lambda: {"paths": set(), "window_start": 0.0})
_scan_lock = threading.Lock()


def _record_unknown_path(ip: str, path: str) -> int:
    """Records an unknown-path hit; returns distinct path count within scan window."""
    now = time.time()
    with _scan_lock:
        entry = _scan_paths[ip]
        if now - entry["window_start"] > SCAN_WINDOW_SECONDS:
            # Reset window
            entry["paths"] = set()
            entry["window_start"] = now
        entry["paths"].add(path)
        return len(entry["paths"])


# ---------------------------------------------------------------------------
# Helper to extract IP (mirrors _extract_client_ip in router.py)
# ---------------------------------------------------------------------------

TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true"


def _get_ip(request: Request) -> str:
    ip = request.client.host if request.client else "0.0.0.0"
    if TRUST_PROXY_HEADERS:
        forwarded = (
            request.headers.get("x-forwarded-for")
            or request.headers.get("x-real-ip")
        )
        if forwarded:
            ip = forwarded.split(",")[0].strip()
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        ip = "0.0.0.0"
    return ip


# ---------------------------------------------------------------------------
# Containment helper — auto-deploys via existing ContainmentOrchestrator
#   so detections appear on the dashboard map automatically.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Reverse Slowloris Tarpit — drip-feed 1 byte every 10 seconds
# ---------------------------------------------------------------------------

TARPIT_MAX_DURATION_SECONDS = int(os.getenv("TARPIT_MAX_DURATION_SECONDS", "300"))  # 5 min max per socket
TARPIT_DRIP_INTERVAL_SECONDS = float(os.getenv("TARPIT_DRIP_INTERVAL_SECONDS", "10"))


async def _tarpit_byte_stream():
    """
    Async generator that drip-feeds 1 null byte every TARPIT_DRIP_INTERVAL_SECONDS.
    Holds the scanner's TCP socket open and exhausts its thread/connection pool.
    Terminates after TARPIT_MAX_DURATION_SECONDS so the server eventually reclaims
    the coroutine even if the scanner keeps the connection alive.
    """
    deadline = time.monotonic() + TARPIT_MAX_DURATION_SECONDS
    while time.monotonic() < deadline:
        yield b"\x00"
        await asyncio.sleep(TARPIT_DRIP_INTERVAL_SECONDS)


def _make_tarpit_response() -> StreamingResponse:
    """
    Returns a StreamingResponse that slowly drip-feeds garbage bytes.
    Uses fake Apache headers so the attacker's scanner treats it as a real server,
    discouraging an early connection close.
    """
    return StreamingResponse(
        _tarpit_byte_stream(),
        status_code=200,
        media_type="text/html",
        headers={
            "Server": "Apache/2.4.51 (Unix) OpenSSL/1.1.1k",
            "X-Geth-Response-Time": "0.001",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _auto_contain(ip: str, reason: str, mode_name: str) -> None:
    """
    Fires ContainmentOrchestrator.deploy() in a thread-safe, non-blocking way.
    Uses the existing ContainmentMode enum to avoid importing ContainmentOrchestrator
    at import time (circular import risk).
    """
    try:
        from containment import containment, ContainmentMode  # lazy import

        mode = ContainmentMode(mode_name)
        threat_id = f"netdef-{ip.replace('.', '-').replace(':', '-')}-{int(time.time())}"
        containment.deploy(ip=ip, mode=mode, threat_id=threat_id, reason=reason)
        logger.warning("network_defense | %s → %s | %s", ip, mode_name, reason)
    except Exception as exc:
        logger.error("network_defense | failed to auto-contain %s: %s", ip, exc)


# ---------------------------------------------------------------------------
# ASGI Middleware
# ---------------------------------------------------------------------------

class ActiveDefenseMiddleware(BaseHTTPMiddleware):
    """
    Plugs into FastAPI's ASGI stack.  Order matters:
      CORSMiddleware → ActiveDefenseMiddleware → add_process_time_header → router
    So this runs *before* auth, which lets it short-circuit brute-force attempts
    early, and *after* CORS so legitimate OPTIONS pre-flights are never blocked.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        ip = _get_ip(request)
        path = request.url.path

        # ── Phase 0: Internal/loopback IPs always pass through ──────────────
        if _is_internal(ip):
            return await call_next(request)

        # ── Phase 0b: Reverse Slowloris — intercept all traffic from tar-pitted IPs ──
        # This fires on EVERY request from a tar-pitted IP (not just RPC calls),
        # consuming the scanner's socket, thread, and connection pool silently.
        try:
            from containment import containment  # lazy import (avoids circular)
            current_mode = containment.get_mode(ip)
            already_contained = current_mode is not None
        except Exception:
            current_mode = None
            already_contained = False

        if current_mode == "TAR_PIT":
            logger.info("network_defense | tarpit stream opened for %s", ip)
            return _make_tarpit_response()

        # ── Phase 1: Per-IP rate limiter ─────────────────────────────────────
        # `already_contained` and `current_mode` are set in Phase 0b above.

        if not already_contained:
            req_count = _record_request(ip)
            if req_count >= RATE_LIMIT_BAN_THRESHOLD:
                _auto_contain(
                    ip,
                    reason=f"Rate flood: {req_count} requests in {RATE_LIMIT_WINDOW_SECONDS}s (ban threshold)",
                    mode_name="SHADOW_BAN",
                )
            elif req_count >= RATE_LIMIT_THRESHOLD:
                _auto_contain(
                    ip,
                    reason=f"Rate flood: {req_count} requests in {RATE_LIMIT_WINDOW_SECONDS}s",
                    mode_name="TAR_PIT",
                )

        # ── Phase 2: Login brute-force lockout ───────────────────────────────
        is_login_post = path == "/api/auth/login" and request.method == "POST"

        response = await call_next(request)

        if is_login_post:
            # 4xx from login endpoint means failed credentials
            if response.status_code in (401, 403, 422):
                failure_count = _record_login_failure(ip)
                if failure_count >= LOGIN_HARD_LIMIT:
                    _auto_contain(
                        ip,
                        reason=f"Brute-force: {failure_count} failed logins in {LOGIN_WINDOW_SECONDS}s",
                        mode_name="SHADOW_BAN",
                    )
                elif failure_count >= LOGIN_SOFT_LIMIT:
                    # Progressive back-off: 1 second per excess attempt beyond soft limit
                    delay = float(failure_count - LOGIN_SOFT_LIMIT + 1)
                    logger.info(
                        "network_defense | login slow-down: %s (failure #%d, %.0fs delay)",
                        ip,
                        failure_count,
                        delay,
                    )
                    await asyncio.sleep(min(delay, 10.0))  # cap at 10s
                    # Add a header so the dashboard can show the active brute-force defence
                    response.headers["X-BB-Login-Lockout"] = str(failure_count)

        # ── Phase 3: Path scan detector ──────────────────────────────────────
        if (
            response.status_code == 404
            and not any(path.startswith(p) for p in SCAN_WHITELIST_PREFIXES)
        ):
            distinct_paths = _record_unknown_path(ip, path)
            if distinct_paths >= SCAN_PATH_THRESHOLD:
                _auto_contain(
                    ip,
                    reason=(
                        f"Directory scan: {distinct_paths} distinct unknown paths "
                        f"in {SCAN_WINDOW_SECONDS}s"
                    ),
                    mode_name="TAR_PIT",
                )

        return response


# ---------------------------------------------------------------------------
# Diagnostic snapshot (used by optional /api/network/stats endpoint)
# ---------------------------------------------------------------------------

def get_defense_snapshot() -> dict[str, Any]:
    """
    Returns current in-memory state for dashboard visibility.
    Safe to call from any thread.
    """
    now_mono = time.monotonic()
    now_wall = time.time()

    with _rate_lock:
        rate_snapshot = {
            ip: len([t for t in dq if t >= now_mono - RATE_LIMIT_WINDOW_SECONDS])
            for ip, dq in _rate_timestamps.items()
            if len([t for t in dq if t >= now_mono - RATE_LIMIT_WINDOW_SECONDS]) > 0
        }

    with _login_lock:
        login_snapshot = {
            ip: len([t for t in ts if t >= now_wall - LOGIN_WINDOW_SECONDS])
            for ip, ts in _login_failures.items()
            if len([t for t in ts if t >= now_wall - LOGIN_WINDOW_SECONDS]) > 0
        }

    with _scan_lock:
        scan_snapshot = {
            ip: len(entry["paths"])
            for ip, entry in _scan_paths.items()
            if entry["paths"] and now_wall - entry["window_start"] <= SCAN_WINDOW_SECONDS
        }

    return {
        "rate_limiter": rate_snapshot,
        "login_failures": login_snapshot,
        "scanner_paths": scan_snapshot,
        "config": {
            "rate_limit_window_seconds": RATE_LIMIT_WINDOW_SECONDS,
            "rate_limit_threshold": RATE_LIMIT_THRESHOLD,
            "rate_limit_ban_threshold": RATE_LIMIT_BAN_THRESHOLD,
            "login_window_seconds": LOGIN_WINDOW_SECONDS,
            "login_soft_limit": LOGIN_SOFT_LIMIT,
            "login_hard_limit": LOGIN_HARD_LIMIT,
            "scan_window_seconds": SCAN_WINDOW_SECONDS,
            "scan_path_threshold": SCAN_PATH_THRESHOLD,
        },
    }
