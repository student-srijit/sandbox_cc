import json
import asyncio
import random
from typing import Dict, Any

from world_state import manager as ws_manager
from classifier import classify_attack
from intelligence import intel_logger
from llm import generate_response
from constants import FAKE_ENV_RESPONSE

class HoneypotEngine:
    """
    The core deception engine. It analyzes incoming requests, classifies their 
    intent, manages the World State, and determines whether to respond with 
    a fast error, a delayed fake, or a deeply generative hallucination based 
    on the attacker's Threat Tier.
    """
    
    def _maybe_auto_contain(
        self,
        session_id: str,
        ip: str,
        tier: str,
        threat_score: int,
        attack_type: str,
    ) -> None:
        """Automatically deploy containment against high-risk attacker traffic."""
        if tier != "BOT":
            return

        from containment import containment, ContainmentMode

        # Do not overwrite an existing manual or automatic containment decision.
        if containment.get_mode(ip):
            return

        high_risk_types = {
            "WALLET_DRAINER",
            "KEY_EXTRACTION",
            "EXPLOIT_EXECUTION",
            "REENTRANCY_PROBE",
            "SQL_INJECTION",
            "PATH_TRAVERSAL",
        }
        recon_types = {
            "RPC_ENUMERATION",
            "CONTRACT_RECON",
            "BALANCE_RECON",
            "DATA_SCRAPING",
            "MEV_BOT_PROBE",
        }

        record = intel_logger.active_threats.get(session_id)
        request_count = 0
        threat_id = None
        if record:
            request_count = int(record.timeline.get("total_requests", 0))
            threat_id = record.threat_id

        if attack_type in high_risk_types:
            # Strong default: immediately cut dangerous payload streams.
            mode = (
                ContainmentMode.QUARANTINE
                if threat_score >= 90
                else ContainmentMode.SHADOW_BAN
            )
            containment.deploy(
                ip=ip,
                mode=mode,
                threat_id=threat_id,
                reason=f"AUTO_BLOCK: {attack_type} detected (score={threat_score})",
            )
            print(f"[{ip}] AUTO_BLOCK ENGAGED -> {mode.value} ({attack_type})")
            return

        # Recon bots get tar-pitted after repeated probing.
        if attack_type in recon_types and request_count >= 6:
            containment.deploy(
                ip=ip,
                mode=ContainmentMode.TAR_PIT,
                threat_id=threat_id,
                reason=f"AUTO_BLOCK: persistent {attack_type} reconnaissance",
            )
            print(f"[{ip}] AUTO_BLOCK ENGAGED -> TAR_PIT ({attack_type})")

    def _normalize_tier(self, tier: str, threat_score: int, attack_type: str) -> str:
        """
        Normalizes incoming tier hints to the engine's supported routing tiers.
        This keeps direct backend callers and legacy trap routes functional.
        """
        normalized = (tier or "").strip().upper()
        if normalized in {"HUMAN", "SUSPICIOUS", "BOT"}:
            return normalized

        # Legacy/high-severity aliases used by some frontend trap paths.
        if normalized in {"EXPLOIT", "MALICIOUS", "ATTACK"}:
            return "BOT"

        # High-risk intent should never be routed as HUMAN/SUSPICIOUS with missing headers.
        if attack_type in {
            "WALLET_DRAINER",
            "KEY_EXTRACTION",
            "EXPLOIT_EXECUTION",
            "REENTRANCY_PROBE",
            "SQL_INJECTION",
            "PATH_TRAVERSAL",
        }:
            return "BOT"

        # Safety net for clients that omit tier headers but provide score.
        if threat_score >= 71:
            return "BOT"
        if threat_score >= 36:
            return "SUSPICIOUS"

        return "HUMAN"

    async def handle_request(
        self, 
        session_id: str, 
        payload: str, 
        headers: dict, 
        threat_score: int, 
        tier: str, 
        ip: str, 
        ua: str
    ) -> Dict[str, Any]:
        """Entrypoint for all JSON-RPC requests."""
        
        # 1. Classification & Intelligence Gathering
        classification = classify_attack(payload, headers)
        tier = self._normalize_tier(tier, threat_score, classification.attack_type)
        
        # We only persist detailed OSINT for Tier 3 "Bot Confirmed" attackers
        if tier == "BOT":
            # Initializes or fetches the ongoing dossier
            intel_logger.init_session(session_id, ip, ua, threat_score, tier, classification)
            
            # Extract method name gently since payload might be malformed JSON
            method = "UNKNOWN"
            try:
                data = json.loads(payload)
                if isinstance(data, dict):
                    method = data.get("method", "UNKNOWN")
            except: pass
            
            intel_logger.record_payload(session_id, method, payload, classification.attack_type)

            # Automatic cyber defense playbook for high-risk traffic.
            self._maybe_auto_contain(
                session_id=session_id,
                ip=ip,
                tier=tier,
                threat_score=threat_score,
                attack_type=classification.attack_type,
            )

        # 1.5 ACTIVE DEFENSE INTERCEPT (THE KILL SWITCHES)
        # --------------------------------------------------------------------
        from containment import containment, ContainmentMode

        # Check both legacy world_state defenses AND the new containment orchestrator
        legacy_weapon = ws_manager.active_defenses.get(ip)
        containment_mode = containment.get_mode(ip) or legacy_weapon

        if containment_mode == ContainmentMode.TAR_PIT or containment_mode == "TAR_PIT":
            # Tactic: Tarpitting. 
            # We exhaust the attacker's connection pool by intentionally 
            # hanging their request for 30 seconds before doing anything else.
            print(f"[{ip}] 🛡️ TAR_PIT ENGAGED. Hanging thread for 30s...")
            await asyncio.sleep(30.0)

        elif containment_mode == ContainmentMode.QUARANTINE or containment_mode == "QUARANTINE":
            # Tactic: Complete quarantine.
            # The attacker receives an empty success response in a tight loop
            # with no useful data, trapping them in their own retry logic.
            print(f"[{ip}] 🔒 QUARANTINE ENGAGED. Returning empty responses...")
            await asyncio.sleep(2.0)
            return {"jsonrpc": "2.0", "result": None, "id": None}

        elif containment_mode == ContainmentMode.SHADOW_BAN or containment_mode == "SHADOW_BAN":
            # Tactic: Silent data poisoning.
            # Return plausible-looking but entirely fabricated data.
            # The attacker thinks they succeeded; their exfiltrated data is worthless.
            print(f"[{ip}] 👻 SHADOW_BAN ENGAGED. Serving poisoned data silently...")
            import secrets as _sec
            return {
                "jsonrpc": "2.0",
                "result": "0x" + _sec.token_hex(32),  # fake tx hash / fake key
                "id": None
            }

        elif containment_mode == ContainmentMode.SINKHOLE or containment_mode == "SINKHOLE":
            # Tactic: Infinite loop sinkhole.
            # Each request is delayed and redirects the attacker deeper into the honeypot
            # by returning an address that points to the next "bait" contract.
            print(f"[{ip}] 🌀 SINKHOLE ENGAGED. Routing attacker into infinite loop...")
            await asyncio.sleep(1.5)
            sinkhole_addresses = [
                "0xDeadBeef00000000000000000000000000000001",
                "0xDeadBeef00000000000000000000000000000002",
                "0xDeadBeef00000000000000000000000000000003",
            ]
            import random as _rand
            return {
                "jsonrpc": "2.0",
                "result": _rand.choice(sinkhole_addresses),
                "id": None
            }

        elif containment_mode == ContainmentMode.POISONED_ABI or containment_mode == "POISONED_ABI":
            # Tactic: Buffer Overflow / Parser Denial of Service.
            # We return an infinitely recursive JSON object that crashes poorly 
            # written JS/Python scraper dictionaries on the attacker's end.
            print(f"[{ip}] ☣️ POISONED_ABI ENGAGED. Detonating JSON bomb...")
            
            # Create a deeply nested structure that exceeds standard parser limits
            bomb = "vulnerability"
            for _ in range(500): 
                bomb = {"payload": bomb}
                
            return {
                "jsonrpc": "2.0", 
                "result": bomb,
                "id": "fatal_overflow"
            }

        # CRITICAL_INCIDENT doesn't alter response behaviour — it only changes UI state

        # 2. Extract standard JSON-RPC ID for response matching
        req_id = None
        try:
            req_data = json.loads(payload)
            req_id = req_data.get("id")
        except:
            return {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}, "id": None}

        # 3. Routing by Threat Tier
        
        if tier == "HUMAN":
            # For humans in this demo, we immediately return a realistic failure.
            # In production, this would proxy pass to a real Infura node.
            return {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found"}, "id": req_id}

        if tier == "SUSPICIOUS":
            # The STATIC HONEYPOT.
            # We delay the response randomly between 800ms and 2000ms.
            # This causes automated scraping tools to queue up and exhaust their own memory.
            delay = random.uniform(0.8, 2.0)
            await asyncio.sleep(delay)
            
            # Check if it matches our static library, if not error out
            from constants import STATIC_RPC_LIBRARY
            method = req_data.get("method")
            if method in STATIC_RPC_LIBRARY:
                return {"jsonrpc": "2.0", "result": STATIC_RPC_LIBRARY[method], "id": req_id}
            else:
                return {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found"}, "id": req_id}

        if tier == "BOT":
            # The GENERATIVE HONEYPOT. 
            # We initialize their World State sandbox and let LLaMA orchestrate the deception.
            # Convert 1-100 score to 1-3 tier for world state 
            ws_tier = 1 if threat_score < 80 else (2 if threat_score < 95 else 3)
            
            world_state = ws_manager.get_or_create(session_id, threat_score, ws_tier)
            world_state.record_action(req_data.get("method", "UNKNOWN"), payload)
            
            # Sync any escalations back into the intelligence logger
            intel_logger.escalate(session_id, world_state.escalation_tier)
            
            response = await generate_response(world_state, payload)
            response["id"] = req_id # Ensure ID always matches regardless of what LLM spit out
            
            # NONCE TRACKING DIRECTIVE:
            # If they actually pushed a transaction through the execution engine logic,
            # increment the world state nonce so the next prompt builds accurately.
            method = req_data.get("method", "UNKNOWN")
            if method == "eth_sendRawTransaction":
                # Only increment if the LLM successfully generated a hash 
                tx_hash = response.get("result", "")
                if isinstance(tx_hash, str) and len(tx_hash) >= 10:
                    world_state.attacker_nonce += 1
                    world_state.record_transaction(tx_hash)
                    print(f"DEBUG: Trapped tx {tx_hash} | Session {session_id} Nonce is now {world_state.attacker_nonce}")
                    
            return response

        # Fallback safety net. Should be unreachable due tier normalization.
        return {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found"}, "id": req_id}
        
    async def handle_static_probe(self, path: str, session_id: str, tier: str, ip: str) -> str:
        """
        Handles explicit, non-RPC HTTP GET probes like '/.env' or '/admin/config.php'
        """
        if ".env" in path.lower():
            # Always ensure a dossier exists so static probes are never dropped from intelligence logs.
            from models import AttackClassification
            forced_class = AttackClassification(
                attack_type="PATH_TRAVERSAL",
                sophistication="script_kiddie",
                inferred_toolchain="Unknown/Direct File Request",
                confidence=1.0
            )
            if session_id not in intel_logger.active_threats:
                effective_tier = self._normalize_tier(tier, 100, forced_class.attack_type)
                intel_logger.init_session(session_id, ip, "UNKNOWN", 100, effective_tier, forced_class)
                
            intel_logger.record_payload(session_id, "GET " + path, "", "PATH_TRAVERSAL")
            
            # Serve the dangerously tempting fake credentials
            return FAKE_ENV_RESPONSE
            
        return "Not found"

honeypot_engine = HoneypotEngine()
