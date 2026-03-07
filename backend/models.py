from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

# If geo.py is parsed, pull the model
try:
    from geo import GeoData
except ImportError:
    GeoData = None

# -------------------------------------------------------------
# JSON-RPC Models
# -------------------------------------------------------------

class JsonRpcRequest(BaseModel):
    """
    Standard JSON-RPC 2.0 Request format.
    Attackers use this to probe the fake node.
    """
    jsonrpc: str = Field(default="2.0")
    method: str
    params: list | dict = Field(default_factory=list)
    id: int | str | None = None

class JsonRpcResponse(BaseModel):
    """
    Standard JSON-RPC 2.0 Success format.
    Must perfectly match Ethereum node specs to maintain the illusion.
    """
    jsonrpc: str = "2.0"
    result: Any
    id: int | str | None = None

class JsonRpcError(BaseModel):
    """
    Standard JSON-RPC 2.0 Error object.
    Provides plausible deniability without revealing the honeypot.
    """
    code: int
    message: str
    data: Optional[Any] = None

class JsonRpcErrorResponse(BaseModel):
    """
    Standard JSON-RPC 2.0 Error Response wrapper.
    """
    jsonrpc: str = "2.0"
    error: JsonRpcError
    id: int | str | None = None

# -------------------------------------------------------------
# Threat Intelligence Models
# -------------------------------------------------------------

class NetworkContext(BaseModel):
    """Information gathered about the attacker's connection."""
    entry_ip: str
    user_agent: str
    threat_score: int
    tier: str
    geo: Optional[Any] = None # Will store GeoData dict if resolved

class AttackClassification(BaseModel):
    """
    The engine's determination of the attacker's nature based 
    on payloads and headers.
    """
    attack_type: str
    sophistication: str
    inferred_toolchain: str
    confidence: float
    # SOC-Grade Explainability fields (populated by containment module)
    attack_technique_id: Optional[str] = None    # MITRE ATT&CK ID, e.g. "T1046"
    attack_technique_name: Optional[str] = None  # Human-readable technique name
    attack_tactic: Optional[str] = None          # ATT&CK tactic phase
    trigger_reason: Optional[str] = None         # Why this alert was raised

class PayloadLog(BaseModel):
    """Individual requests made by an attacker."""
    method: str
    params: str
    timestamp: str
    decoded_intent: str

class ThreatRecord(BaseModel):
    """
    The complete dossier compiled on a single attacker session.
    Used for the Dashboard UI.
    """
    threat_id: str
    session_id: str
    network: NetworkContext
    classification: AttackClassification
    timeline: Dict[str, Any]
    payloads: List[PayloadLog]
    honeypot_effectiveness: Dict[str, Any]

# -------------------------------------------------------------
# Dashboard WebSocket Models
# -------------------------------------------------------------

class DashboardEvent(BaseModel):
    """Real-time event pushed from FastAPI to Next.js UI"""
    event: str  # "NEW_THREAT" | "ESCALATION" | "KEY_DISCOVERED" | "SESSION_END"
    data: Dict[str, Any]
