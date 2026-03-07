from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
import json

from models import JsonRpcRequest, JsonRpcErrorResponse, JsonRpcError
from honeypot import honeypot_engine
from auth import verify_password, create_access_token, verify_token, ADMIN_USER, ADMIN_PASS_HASH


def _unauthorized():
    """Returns a proper HTTP 401 so Next.js can detect and propagate auth failures."""
    return JSONResponse(status_code=401, content={"error": "Unauthorized"})

class LoginRequest(BaseModel):
    username: str
    password: str

router = APIRouter()

@router.get("/api/health")
async def health_check():
    """Returns absolute minimal data to prevent fingerprinting the honeypot."""
    return {"status": "ok"}

@router.get("/api/status")
async def system_status():
    """Fake system status mirroring an Ethereum node."""
    return {"status": "syncing", "highestBlock": "0x125a2fa", "currentBlock": "0x125a2fa"}

@router.post("/api/auth/login")
async def login(credentials: LoginRequest):
    if credentials.username != ADMIN_USER or not verify_password(credentials.password, ADMIN_PASS_HASH):
        # Keep consistent JSON-RPC obscure error payload
        return JsonRpcErrorResponse(
            error=JsonRpcError(code=-32000, message="Unauthorized"), id=None
        )
    
    token = create_access_token({"sub": credentials.username})
    return {"token": token}

@router.get("/api/dashboard/public-stats")
async def get_public_stats():
    """Returns only the active session count for the public login page tease."""
    from intelligence import intel_logger
    active_now = len(intel_logger.active_threats)
    return {"active_sessions": active_now}

@router.get("/api/dashboard")
async def get_dashboard_stats(request: Request):
    """
    Protected endpoint. Requires Bearer token.
    Called by the Next.js frontend to populate the Threat Map.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _unauthorized()
        
    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return _unauthorized()
        
    from database import get_recent_threats, get_dashboard_aggregates
    db_logs = get_recent_threats(limit=50)
    aggs = get_dashboard_aggregates()
    
    # Analyze the active memory array to find "LIVE" attacker count for the dashboard
    from intelligence import intel_logger
    active_now = len(intel_logger.active_threats)
    
    # Merge live in-memory sessions into the response so the feed
    # shows threats BEFORE they are flushed to the DB.
    live_logs = []
    for rec in intel_logger.active_threats.values():
        live_logs.append(rec.model_dump())
    
    # Deduplicate: DB records already flushed should not appear twice
    db_ids = {l.get('threat_id') for l in db_logs}
    unique_live = [l for l in live_logs if l.get('threat_id') not in db_ids]
    
    logs = unique_live + db_logs  # live first, then historical

    # Include containment status for the dashboard war-room indicator
    from containment import containment
    containment_status = containment.get_status()

    return {
        "logs": logs,
        "stats": {
            "total": aggs["total_threats"],
            "bots": active_now,
            "suspicious": 0,
            "mutations_total": aggs["total_mutations"] if "total_mutations" in aggs else aggs.get("total_generations", 0),
            "taxonomy": aggs["taxonomy"]
        },
        "containment": containment_status,
    }

class DefendRequest(BaseModel):
    ip_address: str
    defense_type: str  # "TAR_PIT" | "POISONED_ABI" | "QUARANTINE" | "SHADOW_BAN" | "SINKHOLE" | "CRITICAL_INCIDENT"
    threat_id: str | None = None  # Optional: associate containment with a specific threat record

@router.post("/api/dashboard/defend")
async def deploy_active_defense(request: Request, body: DefendRequest):
    """
    Protected endpoint. Deploys a retaliation payload against a specific IP.
    Supports legacy modes (TAR_PIT, POISONED_ABI) and new containment playbooks.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _unauthorized()
        
    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return _unauthorized()

    from containment import containment, ContainmentMode
    from world_state import manager as ws_manager

    # Normalise and validate the requested mode
    try:
        mode = ContainmentMode(body.defense_type)
    except ValueError:
        return JsonRpcErrorResponse(
            error=JsonRpcError(code=-32602, message=f"Unknown defense_type: {body.defense_type}"),
            id=None,
        )

    # Deploy via the containment orchestrator (superset of world_state defenses)
    containment.deploy(
        ip=body.ip_address,
        mode=mode,
        threat_id=body.threat_id,
        reason=f"Manual deployment by analyst via dashboard",
    )
    # Keep legacy world_state map in sync for TAR_PIT and POISONED_ABI
    if mode in (ContainmentMode.TAR_PIT, ContainmentMode.POISONED_ABI):
        ws_manager.deploy_defense(body.ip_address, body.defense_type)
    
    return {
        "status": "deployed",
        "ip": body.ip_address,
        "mode": mode.value,
        "critical_incident": containment.critical_incident_active,
    }


@router.get("/api/containment/status")
async def get_containment_status(request: Request):
    """
    Protected endpoint. Returns all active containment events and
    whether a CRITICAL_INCIDENT has been declared.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _unauthorized()

    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return _unauthorized()

    from containment import containment
    return containment.get_status()


@router.post("/api/containment/release")
async def release_containment(request: Request):
    """
    Protected endpoint. Analyst releases a contained IP (manual override).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _unauthorized()

    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return _unauthorized()

    body_raw = await request.json()
    ip = body_raw.get("ip_address", "")
    if not ip:
        return {"status": "error", "detail": "ip_address required"}

    from containment import containment
    containment.release(ip)
    # Also clear critical incident if no more containments
    if not containment.active_containments:
        containment.critical_incident_active = False
        containment.critical_incident_threat_id = None
    return {"status": "released", "ip": ip}

@router.post("/api/flush")
async def force_flush():
    """Forces the intelligence logger to flush all active dossiers to SQLite."""
    from intelligence import intel_logger
    flushed = []
    
    # We copy keys to list to avoid runtime dictionary size changes
    for sess_id in list(intel_logger.active_threats.keys()):
        intel_logger.finalize_session(sess_id)
        flushed.append(sess_id)
        
    return {"status": "ok", "flushed_count": len(flushed)}

from fastapi.responses import StreamingResponse

@router.get("/api/replay/{threat_id}")
async def get_session_replay(request: Request, threat_id: str):
    """
    Returns the ordered sequence of RPC payloads for a given threat session,
    enriched with timing deltas so the frontend can replay the attack step by step.
    Requires Bearer token.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JsonRpcErrorResponse(error=JsonRpcError(code=-32000, message="Unauthorized"), id=None)

    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return JsonRpcErrorResponse(error=JsonRpcError(code=-32000, message="Unauthorized"), id=None)

    from database import get_threat_by_id
    record = get_threat_by_id(threat_id)
    if not record:
        # Session may still be live in memory and not yet flushed to SQLite
        from intelligence import intel_logger
        for sess_record in intel_logger.active_threats.values():
            if sess_record.threat_id == threat_id:
                record = sess_record.model_dump()
                break
    if not record:
        raise HTTPException(status_code=404, detail="Threat dossier not found")

    payloads = record.get("payloads", [])

    # Calculate inter-request deltas (ms) for replay timing
    enriched = []
    prev_ts = None
    for i, p in enumerate(payloads):
        try:
            from datetime import datetime as dt
            ts_str = p.get("timestamp", "")
            # Handle both Z-suffix and +00:00 formats
            ts = dt.fromisoformat(ts_str.replace("Z", "+00:00"))
            delta_ms = int((ts - prev_ts).total_seconds() * 1000) if prev_ts else 0
            prev_ts = ts
        except Exception:
            delta_ms = 0

        enriched.append({
            "step": i + 1,
            "method": p.get("method", "unknown"),
            "params": p.get("params", "[]"),
            "decoded_intent": p.get("decoded_intent", ""),
            "timestamp": p.get("timestamp", ""),
            "delta_ms": delta_ms,
        })

    raw_cls = record.get("classification", {})

    # Enrich classification with ATT&CK metadata if not already present
    if not raw_cls.get("attack_technique_id"):
        try:
            from containment import get_attack_technique, build_trigger_reason
            tech = get_attack_technique(raw_cls.get("attack_type", "RPC_PROBING"))
            raw_cls["attack_technique_id"] = tech.get("technique_id")
            raw_cls["attack_technique_name"] = tech.get("technique_name")
            raw_cls["attack_tactic"] = tech.get("tactic")
            if not raw_cls.get("trigger_reason"):
                raw_cls["trigger_reason"] = build_trigger_reason(
                    raw_cls.get("attack_type", "RPC_PROBING"),
                    raw_cls.get("confidence", 0.5),
                    len(payloads),
                    record.get("network", {}).get("tier", "BOT"),
                )
        except Exception:
            pass

    return {
        "threat_id": record.get("threat_id"),
        "session_id": record.get("session_id"),
        "ip": record.get("network", {}).get("entry_ip", "0.0.0.0"),
        "toolchain": raw_cls.get("inferred_toolchain", "Unknown"),
        "attack_type": raw_cls.get("attack_type", "Unknown"),
        "classification": raw_cls,
        "total_steps": len(enriched),
        "time_wasted_seconds": record.get("timeline", {}).get("time_wasted_seconds", 0),
        "steps": enriched,
    }


@router.get("/api/report/{threat_id}")
async def download_threat_report(request: Request, threat_id: str):
    """
    Generates and downloads a synthesized PDF Threat Report using 
    Generative AI and the raw session captures.
    """
    auth_header = request.headers.get("Authorization", "")
    # In a full production build, we would secure this with the same verify_token
    # But for ease of debugging/downloading via a standard anchor tag in the 
    # hackathon demo, we'll allow standard API access.
    
    from database import get_threat_by_id
    from llm import generate_executive_summary, generate_recommendations
    from report_generator import generate_threat_pdf
    
    threat_record = get_threat_by_id(threat_id)
    if not threat_record:
        raise HTTPException(status_code=404, detail="Threat dossier not found")
        
    # Generate the AI sections
    exec_summary = await generate_executive_summary(threat_record)
    recommendations = await generate_recommendations(threat_record)
    
    # Render the canvas
    pdf_bytes = generate_threat_pdf(threat_record, exec_summary, recommendations)
    
    # Return as a downloadable stream
    return StreamingResponse(
        pdf_bytes, 
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Threat_Intel_Report_{threat_id}.pdf"
        }
    )

import hashlib

@router.get("/api/ledger")
async def get_public_ledger():
    """
    Public endpoint for the Immutable Threat Ledger.
    Returns anonymized threat data and stable evidence hashes.
    """
    from database import get_recent_threats
    from containment import containment
    logs = get_recent_threats(limit=100)
    
    ledger_entries = []
    for log in logs:
        timeline = log.get("timeline", {})
        ts = timeline.get("first_seen", "Unknown")
        threat_id = log.get("threat_id", "UNKNOWN")
        entry_ip = log.get("network", {}).get("entry_ip", "0.0.0.0")
        tier = log.get("network", {}).get("tier", "UNKNOWN")
        attack_type = log.get("classification", {}).get("attack_type", "UNKNOWN")
        confidence = float(log.get("classification", {}).get("confidence", 0.0) or 0.0)
        toolchain = log.get("classification", {}).get("inferred_toolchain", "Unknown")
        payloads = log.get("payloads", [])
        containment_mode = containment.get_mode(entry_ip)
        containment_event = containment.active_containments.get(entry_ip, {})

        is_attack = tier in {"BOT", "SUSPICIOUS"} or attack_type not in {"UNKNOWN", "BENIGN"}
        record_type = "ATTACK" if is_attack else "REAL_TRANSACTION"
        auto_blocked = bool(containment_mode) and is_attack
        status_label = (
            "AUTO_BLOCKED"
            if auto_blocked
            else ("ATTACK_DETECTED" if is_attack else "REAL_TRANSACTION")
        )

        # Build a canonical immutable payload so the content hash remains stable
        # across API reloads and minor backend shape changes.
        canonical_payload = {
            "threat_id": threat_id,
            "timestamp": ts,
            "ip": entry_ip,
            "tier": tier,
            "toolchain": toolchain,
            "payload_methods": [p.get("method", "") for p in payloads],
            "request_count": timeline.get("total_requests", len(payloads)),
        }
        
        raw_json = json.dumps(canonical_payload, sort_keys=True)
        content_hash = "0x" + hashlib.sha256(raw_json.encode('utf-8')).hexdigest()
        evidence_id = "EV-" + hashlib.sha256(f"{threat_id}:{content_hash}".encode('utf-8')).hexdigest()[:20].upper()
        
        ledger_entries.append({
            "threat_id": threat_id,
            "timestamp": ts,
            "ip": entry_ip,
            "tier": tier,
            "toolchain": toolchain,
            "attack_type": attack_type,
            "confidence": round(confidence, 3),
            "record_type": record_type,
            "auto_blocked": auto_blocked,
            "containment_mode": containment_mode,
            "containment_reason": containment_event.get("reason", ""),
            "status_label": status_label,
            "content_hash": content_hash,
            # Keep backward compatibility for existing frontend field name.
            "tx_hash": content_hash,
            "evidence_id": evidence_id,
        })
        
    return {"ledger": ledger_entries}

@router.post("/api/rpc")
async def handle_rpc(request: Request):
    """
    The main JSON-RPC endpoint. Evaluates all incoming traffic based 
    on the X-BB-Threat-Score header passed down by the Next.js edge proxies.
    """
    headers = dict(request.headers)
    
    tier = headers.get("x-bb-tier", "UNKNOWN")
    session_id = headers.get("x-bb-session", request.client.host if request.client else "unknown-ip")
    # Priority: X-Forwarded-For (for simulation/proxies) > Request Client Host
    ip = headers.get("x-forwarded-for", request.client.host if request.client else "0.0.0.0")
    if "," in ip: # Handle multiple proxies
        ip = ip.split(",")[0].strip()
    ua = headers.get("user-agent", "")
    
    print(f"[HTTP] Inbound POST /api/rpc | Tier: {tier} | Session: {session_id} | IP: {ip}")
    
    try:
        threat_score = int(headers.get("x-bb-threat-score", 0))
    except ValueError:
        threat_score = 0
        
    try:
        # We read the raw body rather than using Pydantic here because 
        # attackers often send malformed JSON that crashes strict unmarshallers.
        # We want to catch and log malformed junk, not 422 HTTP error on it.
        raw_body = await request.body()
        payload_str = raw_body.decode('utf-8')
        
        # Fast fail if it's completely unparseable
        if not payload_str.strip():
            return JsonRpcErrorResponse(
                error=JsonRpcError(code=-32700, message="Parse error"), id=None
            )
            
        # Delegate down to the honeypot router
        response = await honeypot_engine.handle_request(
            session_id=session_id,
            payload=payload_str,
            headers=headers,
            threat_score=threat_score,
            tier=tier,
            ip=ip,
            ua=ua
        )
        
        return response
        
    except Exception as e:
        # Standard generic error to prevent 500 stack traces blowing our cover
        print(f"Server error handling RPC: {e}")
        return JsonRpcErrorResponse(
            error=JsonRpcError(code=-32603, message="Internal error"), id=None
        )

@router.post("/api/rpc/batch")
async def handle_rpc_batch(request: Request):
    """Batch requests represent a massive LLM overhead, so we drop them for this demo."""
    return JsonRpcErrorResponse(
        error=JsonRpcError(code=-32600, message="Batch requests temporarily disabled due to load"), 
        id=None
    )

@router.get("/{full_path:path}")
async def catch_all_get(full_path: str, request: Request, response: Response):
    """
    Catches ALL non-RPC requests like `/.env` or `/admin` 
    and checks if they are known attack probes.
    """
    headers = dict(request.headers)
    tier = headers.get("x-bb-tier", "UNKNOWN")
    session_id = headers.get("x-bb-session", request.client.host if request.client else "unknown-ip")
    ip = request.client.host if request.client else "0.0.0.0"
    
    fake_response = await honeypot_engine.handle_static_probe(
        f"/{full_path}", session_id, tier, ip
    )
    
    if fake_response != "Not found":
        response.headers["Content-Type"] = "text/plain"
        return fake_response
        
    raise HTTPException(status_code=404, detail="Not Found")
