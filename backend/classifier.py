import re
from typing import Optional
from models import AttackClassification
from constants import SQL_INJECTION_PATTERNS, PATH_TRAVERSAL_PATTERNS, KNOWN_ATTACK_TOOLS

def classify_attack(payload: str, headers: dict) -> AttackClassification:
    """
    Analyzes the raw JSON-RPC payload and HTTP headers to categorize 
    the attacker's intent and sophistication level.
    """
    attack_type = "RPC_PROBING"  # sensible default for any RPC activity
    sophistication = "script_kiddie"
    inferred_toolchain = "Unknown Tooling"
    confidence = 0.5
    
    payload_lower = payload.lower()
    
    # 1. Intent Classification
    if "eth_getprivatekey" in payload_lower or "personal_exportrawkey" in payload_lower:
        attack_type = "KEY_EXTRACTION"
        confidence = 0.95
        
    elif "eth_sendtransaction" in payload_lower and "value" in payload_lower:
        attack_type = "WALLET_DRAINER"
        confidence = 0.8
        
    elif "eth_sendrawtransaction" in payload_lower:
        attack_type = "WALLET_DRAINER"
        confidence = 0.85

    elif any(pattern.lower() in payload_lower for pattern in SQL_INJECTION_PATTERNS):
        attack_type = "SQL_INJECTION"
        confidence = 0.95
        
    elif any(pattern.lower() in payload_lower for pattern in PATH_TRAVERSAL_PATTERNS):
        attack_type = "PATH_TRAVERSAL"
        confidence = 0.95
        
    elif "eth_call" in payload_lower and "data" in payload_lower:
        attack_type = "REENTRANCY_PROBE"
        confidence = 0.7

    elif "eth_chainid" in payload_lower or "eth_accounts" in payload_lower:
        attack_type = "RPC_ENUMERATION"
        confidence = 0.75

    elif "eth_getbalance" in payload_lower or "eth_getblocknumber" in payload_lower:
        attack_type = "BALANCE_RECON"
        confidence = 0.7

    elif "eth_getcode" in payload_lower or "eth_getstorageat" in payload_lower:
        attack_type = "CONTRACT_RECON"
        confidence = 0.8

    elif "eth_getlogs" in payload_lower or "eth_getblockbynumber" in payload_lower:
        attack_type = "DATA_SCRAPING"
        confidence = 0.7

    elif "eth_estimategas" in payload_lower:
        attack_type = "EXPLOIT_PREPARATION"
        confidence = 0.75
        
    # 2. Toolchain Inference
    user_agent = headers.get("user-agent", "")
    
    for tool, name in KNOWN_ATTACK_TOOLS.items():
        if tool.lower() in user_agent.lower():
            inferred_toolchain = name
            confidence += 0.1
            break
            
    if inferred_toolchain == "Unknown Tooling":
        # Check specifically for web3 libraries masquerading
        if "python" in user_agent.lower():
            inferred_toolchain = "Python/web3.py"
            sophistication = "targeted"
        elif "node" in user_agent.lower() or "axios" in user_agent.lower():
            inferred_toolchain = "Node.js/ethers.js"
            sophistication = "targeted"
            
    # 3. Sophistication Scoring
    if inferred_toolchain in ["curl/wget", "Python/Requests"]:
        sophistication = "script_kiddie"
    elif attack_type in ["REENTRANCY_PROBE", "WALLET_DRAINER"]:
        # If they aren't using a default UA and are doing complex RPC
        if inferred_toolchain == "Unknown Tooling":
             sophistication = "advanced"
             inferred_toolchain = "Custom Hex Toolchain"
             
    # Cap confidence
    confidence = min(1.0, confidence)

    # Attach MITRE ATT&CK metadata and SOC trigger reason
    try:
        from containment import get_attack_technique, build_trigger_reason
        tech = get_attack_technique(attack_type)
        tier = headers.get("x-bb-tier", "UNKNOWN")
        trigger_reason = build_trigger_reason(attack_type, confidence, 1, tier)
    except Exception:
        tech = {}
        trigger_reason = None

    return AttackClassification(
        attack_type=attack_type,
        sophistication=sophistication,
        inferred_toolchain=inferred_toolchain,
        confidence=confidence,
        attack_technique_id=tech.get("technique_id"),
        attack_technique_name=tech.get("technique_name"),
        attack_tactic=tech.get("tactic"),
        trigger_reason=trigger_reason,
    )

def infer_toolchain_from_sequence(payloads: list) -> Optional[str]:
    """
    Analyzes the chronological sequence of JSON-RPC methods called 
    to definitively fingerprint the hacking tool.
    """
    if not payloads:
        return None
        
    methods = [p.method for p in payloads]
    seq_str = ",".join(methods)
    
    # 1. Definite Drainers
    if "eth_chainId,eth_accounts,eth_getBalance" in seq_str:
        return "MetaMask Drainer Script"
        
    if "eth_estimateGas,eth_sendRawTransaction" in seq_str:
        return "Exploit Executer (Targeted)"
        
    # 2. MEV Bots / Arbitrage
    # Looking for repetitive rapid-fire contract calls
    if methods.count("eth_call") > 5 and len(set(methods[-4:])) == 1:
        return "Automated Arbitrage/MEV Bot"
        
    # 3. Node Indexing / Data Scraping
    if methods.count("eth_getBlockByNumber") > 3 or methods.count("eth_getLogs") > 3:
        return "Node Indexer Scraping Script"
        
    # 4. Reconnaissance Tooling
    if "eth_getCode,eth_getStorageAt" in seq_str:
        return "Vuln Scanner (Recon)"
        
    return None
