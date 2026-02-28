import uuid
from datetime import datetime
import asyncio
from typing import Dict, Any, Optional

from models import ThreatRecord, NetworkContext, AttackClassification, PayloadLog
from database import log_threat

# Setup safe geo import
try:
    from geo import geolocate, GeoData
except ImportError:
    geolocate = None
    GeoData = None

class ThreatIntelligenceLogger:
    """
    Stateful logger that tracks an attacker's entire lifecycle across 
    multiple requests. When the session ends or escalates, it persists 
    the completed dossier to SQLite.
    """
    def __init__(self):
        self.active_threats: Dict[str, ThreatRecord] = {}

    def init_session(
        self, 
        session_id: str, 
        ip: str, 
        ua: str, 
        score: int, 
        tier: str, 
        classification: AttackClassification
    ) -> ThreatRecord:
        
        if session_id in self.active_threats:
            return self.active_threats[session_id]
            
        record = ThreatRecord(
            threat_id=f"TR-2026-BB-{uuid.uuid4().hex[:8].upper()}",
            session_id=session_id,
            network=NetworkContext(
                entry_ip=ip,
                user_agent=ua,
                threat_score=score,
                tier=tier
            ),
            classification=classification,
            timeline={
                "first_seen": datetime.utcnow().isoformat() + "Z",
                "last_active": datetime.utcnow().isoformat() + "Z",
                "time_wasted_seconds": 0,
                "total_requests": 0,
                "escalation_reached": 1
            },
            payloads=[],
            honeypot_effectiveness={
                "fake_keys_exposed": 0,
                "bait_wallets_discovered": 0,
                "deepest_escalation": 1,
                "estimated_compute_wasted": "Low"
            }
        )
        
        self.active_threats[session_id] = record
        
        # Fire and forget asynchronous geolocation enrichment
        if geolocate is not None:
            # Create task without awaiting so we don't block the high-speed Next.js proxy
            asyncio.create_task(self._enrich_geo(session_id, ip))
            
        return record

    async def _enrich_geo(self, session_id: str, ip: str):
        """Background task to fetch GPS coordinates without impacting proxy latency."""
        try:
            geo_data = await geolocate(ip)
            if geo_data and session_id in self.active_threats:
                # Attach to record
                self.active_threats[session_id].network.geo = geo_data.model_dump()
                
                # Dynamic scoring penalty
                if geo_data.proxy or geo_data.hosting:
                    score = self.active_threats[session_id].network.threat_score
                    self.active_threats[session_id].network.threat_score = min(score + 8, 100)
                    print(f"[GEO] Applied +8 Hosting/Proxy Threat Penalty to session {session_id}")
        except Exception as e:
            print(f"[GEO] Enrichment failed in background task: {e}")

    def record_payload(self, session_id: str, method: str, params: Any, intent: str):
        if session_id not in self.active_threats:
            return
            
        record = self.active_threats[session_id]
        
        record.timeline["last_active"] = datetime.utcnow().isoformat() + "Z"
        record.timeline["total_requests"] += 1
        
        first = datetime.fromisoformat(record.timeline["first_seen"].replace("Z", "+00:00"))
        now = datetime.utcnow()
        wasted = (now - first.replace(tzinfo=None)).total_seconds()
        record.timeline["time_wasted_seconds"] = int(wasted)
        
        record.payloads.append(PayloadLog(
            method=method,
            params=str(params)[:500],
            timestamp=datetime.utcnow().isoformat() + "Z",
            decoded_intent=intent
        ))

    def escalate(self, session_id: str, new_tier: int):
        if session_id not in self.active_threats:
            return
        record = self.active_threats[session_id]
        record.timeline["escalation_reached"] = new_tier
        record.honeypot_effectiveness["deepest_escalation"] = new_tier
        
        if new_tier == 2:
            record.honeypot_effectiveness["fake_keys_exposed"] = 1
            record.honeypot_effectiveness["estimated_compute_wasted"] = "Medium"
        elif new_tier >= 3:
            record.honeypot_effectiveness["bait_wallets_discovered"] = 2
            record.honeypot_effectiveness["estimated_compute_wasted"] = "High"

    def finalize_session(self, session_id: str):
        """Saves the record to SQLite and removes from active memory."""
        if session_id in self.active_threats:
            record = self.active_threats[session_id]
            log_threat(record)
            del self.active_threats[session_id]
            return record
        return None

# Global instance
intel_logger = ThreatIntelligenceLogger()
