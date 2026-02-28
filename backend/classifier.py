import re
from typing import Optional
from models import AttackClassification
from constants import SQL_INJECTION_PATTERNS, PATH_TRAVERSAL_PATTERNS, KNOWN_ATTACK_TOOLS

def classify_attack(payload: str, headers: dict) -> AttackClassification:
    """
    Analyzes the raw JSON-RPC payload and HTTP headers to categorize 
    the attacker's intent and sophistication level.
    """
    attack_type = "UNKNOWN"
    sophistication = "script_kiddie"
    inferred_toolchain = "Unknown Tooling"
    confidence = 0.5
    
    payload_lower = payload.lower()
    
    # 1. Intent Classification
    if "eth_getprivatekey" in payload_lower or "personal_exportrawkey" in payload_lower:
        attack_type = "RPC_PROBING"
        confidence = 0.9
        
    elif "eth_sendtransaction" in payload_lower and "value" in payload_lower:
        # Assuming they are trying to blindly sweep our bait funds
        attack_type = "WALLET_DRAINER"
        confidence = 0.8
        
    elif any(pattern.lower() in payload_lower for pattern in SQL_INJECTION_PATTERNS):
        attack_type = "SQL_INJECTION"
        confidence = 0.95
        
    elif any(pattern.lower() in payload_lower for pattern in PATH_TRAVERSAL_PATTERNS):
        attack_type = "PATH_TRAVERSAL"
        confidence = 0.95
        
    elif "eth_call" in payload_lower and "data" in payload_lower:
        # A basic heuristic for reentrancy probes: heavy hex data on eth_call
        attack_type = "REENTRANCY_PROBE"
        confidence = 0.7
        
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
    
    return AttackClassification(
        attack_type=attack_type,
        sophistication=sophistication,
        inferred_toolchain=inferred_toolchain,
        confidence=confidence
    )
