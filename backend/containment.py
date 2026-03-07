"""
Automated Containment Simulator for the Bhool Bhulaiyaa Honeypot Engine.

Provides hardcoded containment playbooks that can be applied against
detected threat actors. Each mode is designed to waste attacker compute,
poison their data streams, or escalate to a critical incident state.
"""

import time
import logging
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger("containment")


class ContainmentMode(str, Enum):
    TAR_PIT = "TAR_PIT"              # 30-second hang → exhausts connection pool
    POISONED_ABI = "POISONED_ABI"    # Nested JSON bomb → crashes attacker parser
    QUARANTINE = "QUARANTINE"        # Total traffic block + honeypot loop with no data
    SHADOW_BAN = "SHADOW_BAN"        # Silent success responses with corrupted data
    SINKHOLE = "SINKHOLE"            # Redirect all RPC calls to an infinite loop trap
    CRITICAL_INCIDENT = "CRITICAL_INCIDENT"  # Escalates UI to red-alert war-room mode


# MITRE ATT&CK technique mappings for each attack type
ATTACK_TECHNIQUE_MAP: Dict[str, Dict[str, str]] = {
    "KEY_EXTRACTION": {
        "technique_id": "T1555",
        "technique_name": "Credentials from Password Stores",
        "tactic": "Credential Access",
        "description": "Adversary attempted to extract private keys from the node's internal keystore.",
    },
    "WALLET_DRAINER": {
        "technique_id": "T1657",
        "technique_name": "Financial Theft",
        "tactic": "Impact",
        "description": "Adversary attempted to exfiltrate funds via crafted eth_sendTransaction payloads.",
    },
    "SQL_INJECTION": {
        "technique_id": "T1190",
        "technique_name": "Exploit Public-Facing Application",
        "tactic": "Initial Access",
        "description": "Adversary injected SQL payloads via RPC parameter fields to probe backend databases.",
    },
    "PATH_TRAVERSAL": {
        "technique_id": "T1083",
        "technique_name": "File and Directory Discovery",
        "tactic": "Discovery",
        "description": "Adversary probed filesystem paths (/.env, /config) to harvest credentials.",
    },
    "REENTRANCY_PROBE": {
        "technique_id": "T1203",
        "technique_name": "Exploitation for Client Execution",
        "tactic": "Execution",
        "description": "Adversary called eth_call with suspicious calldata indicative of reentrancy exploit setup.",
    },
    "RPC_ENUMERATION": {
        "technique_id": "T1046",
        "technique_name": "Network Service Discovery",
        "tactic": "Discovery",
        "description": "Adversary enumerated available RPC methods to fingerprint node software version.",
    },
    "BALANCE_RECON": {
        "technique_id": "T1087",
        "technique_name": "Account Discovery",
        "tactic": "Discovery",
        "description": "Adversary queried wallet balances to identify high-value targets for draining.",
    },
    "CONTRACT_RECON": {
        "technique_id": "T1518",
        "technique_name": "Software Discovery",
        "tactic": "Discovery",
        "description": "Adversary fetched contract bytecode and storage to locate exploitable smart contract logic.",
    },
    "DATA_SCRAPING": {
        "technique_id": "T1074",
        "technique_name": "Data Staged",
        "tactic": "Collection",
        "description": "Adversary bulk-scraped block and event log data, likely for off-chain analysis.",
    },
    "EXPLOIT_PREPARATION": {
        "technique_id": "T1588",
        "technique_name": "Obtain Capabilities",
        "tactic": "Resource Development",
        "description": "Adversary estimated gas costs for a prepared exploit transaction before submission.",
    },
    "RPC_PROBING": {
        "technique_id": "T1046",
        "technique_name": "Network Service Discovery",
        "tactic": "Discovery",
        "description": "Adversary probed JSON-RPC endpoint to confirm node presence and gather version info.",
    },
    "MEV_BOT_PROBE": {
        "technique_id": "T1496",
        "technique_name": "Resource Hijacking",
        "tactic": "Impact",
        "description": "Automated MEV bot probing mempool to front-run or sandwich pending transactions.",
    },
    "EXPLOIT_EXECUTION": {
        "technique_id": "T1059",
        "technique_name": "Command and Scripting Interpreter",
        "tactic": "Execution",
        "description": "Adversary executed a pre-built exploit transaction against the target contract.",
    },
}


def get_attack_technique(attack_type: str) -> Dict[str, str]:
    """Returns the MITRE ATT&CK technique for a given attack type."""
    return ATTACK_TECHNIQUE_MAP.get(attack_type, {
        "technique_id": "T1059",
        "technique_name": "Command and Scripting Interpreter",
        "tactic": "Execution",
        "description": "Unknown or generic RPC exploitation attempt.",
    })


def build_trigger_reason(attack_type: str, confidence: float, payload_count: int, tier: str) -> str:
    """
    Generates a human-readable SOC explanation for why this alert was triggered.
    Mirrors real SOC alert reasoning for analyst review.
    """
    tech = get_attack_technique(attack_type)
    conf_pct = int(confidence * 100)

    reasons = []

    if tier == "BOT":
        reasons.append("Request fingerprinted as automated bot (non-browser User-Agent, no JS challenge solved)")

    if attack_type == "WALLET_DRAINER":
        reasons.append("eth_sendTransaction detected with non-zero value field targeting known bait address")
    elif attack_type == "KEY_EXTRACTION":
        reasons.append("personal_exportRawKey or eth_getPrivateKey RPC method called — no legitimate client does this")
    elif attack_type == "REENTRANCY_PROBE":
        reasons.append("eth_call with suspicious calldata resembling reentrancy attack setup pattern")
    elif attack_type == "SQL_INJECTION":
        reasons.append("SQL injection syntax detected in RPC parameter field (UNION SELECT / OR 1=1)")
    elif attack_type == "PATH_TRAVERSAL":
        reasons.append("Direct filesystem path probe detected (/.env, /admin, /config.php)")
    elif attack_type == "RPC_ENUMERATION":
        reasons.append("Sequential enumeration of eth_chainId, eth_accounts, net_version in rapid succession")
    elif attack_type == "CONTRACT_RECON":
        reasons.append("eth_getCode + eth_getStorageAt sequence — classic vulnerability scanner fingerprint")
    elif attack_type == "BALANCE_RECON":
        reasons.append("eth_getBalance queried against multiple addresses — wallet target identification sweep")
    elif attack_type == "DATA_SCRAPING":
        reasons.append("Bulk eth_getLogs / eth_getBlockByNumber iteration — node indexer or data harvester")
    elif attack_type == "EXPLOIT_PREPARATION":
        reasons.append("eth_estimateGas called before transaction submission — exploit cost calculation phase")
    elif attack_type == "MEV_BOT_PROBE":
        reasons.append("Rapid-fire eth_call against liquidity pool contracts — MEV front-running bot signature")
    else:
        reasons.append(f"Anomalous RPC pattern matched {attack_type} attack signature")

    if payload_count >= 5:
        reasons.append(f"Persistent session: {payload_count} requests in sequence indicates automated tooling")

    reason_text = ". ".join(reasons) + f". Confidence: {conf_pct}% | ATT&CK: {tech['technique_id']} ({tech['tactic']})"
    return reason_text


class ContainmentOrchestrator:
    """
    Manages active containment events. Tracks which IPs are contained,
    in which mode, and when escalation to CRITICAL_INCIDENT occurred.
    """

    def __init__(self):
        # ip -> {mode, activated_at, threat_id, reason}
        self.active_containments: Dict[str, Dict[str, Any]] = {}
        # Track if any session has reached CRITICAL_INCIDENT state
        self.critical_incident_active: bool = False
        self.critical_incident_threat_id: Optional[str] = None

    def deploy(
        self,
        ip: str,
        mode: ContainmentMode,
        threat_id: Optional[str] = None,
        reason: str = "",
    ) -> Dict[str, Any]:
        """Deploys a containment playbook against the given IP."""
        event = {
            "ip": ip,
            "mode": mode.value,
            "activated_at": time.time(),
            "threat_id": threat_id,
            "reason": reason,
        }
        self.active_containments[ip] = event

        if mode == ContainmentMode.CRITICAL_INCIDENT:
            self.critical_incident_active = True
            self.critical_incident_threat_id = threat_id
            logger.warning(f"🚨 CRITICAL INCIDENT DECLARED for IP {ip} | Threat: {threat_id}")
        else:
            logger.info(f"[CONTAINMENT] {mode.value} deployed against {ip}")

        return event

    def get_mode(self, ip: str) -> Optional[str]:
        """Returns the active containment mode for an IP, or None."""
        event = self.active_containments.get(ip)
        return event["mode"] if event else None

    def release(self, ip: str):
        """Removes containment for an IP (manual analyst override)."""
        if ip in self.active_containments:
            del self.active_containments[ip]
            logger.info(f"[CONTAINMENT] Released {ip}")

    def get_status(self) -> Dict[str, Any]:
        """Returns a dashboard-ready summary of all active containments."""
        return {
            "active_count": len(self.active_containments),
            "critical_incident": self.critical_incident_active,
            "critical_threat_id": self.critical_incident_threat_id,
            "containments": [
                {
                    "ip": ip,
                    "mode": ev["mode"],
                    "threat_id": ev.get("threat_id"),
                    "age_seconds": int(time.time() - ev["activated_at"]),
                }
                for ip, ev in self.active_containments.items()
            ],
        }


# Global singleton
containment = ContainmentOrchestrator()
