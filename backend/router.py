from fastapi import APIRouter, Request, HTTPException, Response
from pydantic import BaseModel, ValidationError
import json

from models import JsonRpcRequest, JsonRpcErrorResponse, JsonRpcError
from honeypot import honeypot_engine
from auth import verify_password, create_access_token, verify_token, ADMIN_USER, ADMIN_PASS_HASH

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
        return JsonRpcErrorResponse(error=JsonRpcError(code=-32000, message="Unauthorized"), id=None)
        
    token = auth_header.split(" ")[1]
    try:
        verify_token(token)
    except ValueError:
        return JsonRpcErrorResponse(error=JsonRpcError(code=-32000, message="Unauthorized"), id=None)
        
    from database import get_recent_threats, get_dashboard_aggregates
    logs = get_recent_threats(limit=50)
    aggs = get_dashboard_aggregates()
    
    # Analyze the active memory array to find "LIVE" attacker count for the dashboard
    from intelligence import intel_logger
    active_now = len(intel_logger.active_threats)
    
    return {
        "logs": logs,
        "stats": {
            "total": aggs["total_threats"],
            "bots": active_now,
            "suspicious": 0,
            "mutations_total": aggs["total_generations"],
            "taxonomy": aggs["taxonomy"]
        }
    }

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

@router.post("/api/rpc")
async def handle_rpc(request: Request):
    """
    The main JSON-RPC endpoint. Evaluates all incoming traffic based 
    on the X-BB-Threat-Score header passed down by the Next.js edge proxies.
    """
    headers = dict(request.headers)
    
    tier = headers.get("x-bb-tier", "UNKNOWN")
    session_id = headers.get("x-bb-session", request.client.host if request.client else "unknown-ip")
    ip = request.client.host if request.client else "0.0.0.0"
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
