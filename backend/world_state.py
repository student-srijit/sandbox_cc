"""
World State Manager for the Polymorphic Honeypot Engine.
This module maintains a persistent, believable fake blockchain session for 
each attacker to interact with, delaying them and tricking them into 
revealing their true intentions (e.g. by submitting transactions).
"""
import time
import secrets
from typing import Dict, Any, List
from datetime import datetime

class WorldState:
    def __init__(self, session_id: str, threat_score: int, tier: int):
        self.session_id = session_id
        self.threat_score = threat_score
        self.tier = tier
        
        self.created_at = time.time()
        self.last_active = self.created_at
        
        # Starts dynamically from real Ethereum mainnet height provided by Manager
        self.simulated_block_height = manager.initial_block_height if 'manager' in globals() else 19247832 
        self.simulated_timestamp = int(self.created_at)
        
        self.attacker_nonce = 0
        self.fake_private_key = "0x" + secrets.token_hex(32)
        
        # Ranges from 1 (basic) to 3 (jackpot). Increases as attacker probes deeper.
        self.escalation_tier = 1 
        
        self.known_addresses = {
            # The bait wallets with tempting balances
            "0xBaitWallet001...": {
                "nonce": 142,
                "balance_wei": "0x7e02dfaa369c0000",  # ~9 ETH
                "label": "bait_high_value"
            },
            "0xBaitWallet002...": {
                "nonce": 891,
                "balance_wei": "0x1121d1d86d5e0000",   # ~1.2 ETH
                "label": "bait_medium_value"
            }
        }
        
        # We start exposing the jackpot wallet only when escalation hits tier 3
        # This keeps advanced scrapers engaged longer trying to unlock it.
        self.jackpot_wallet = {
            "0xAdminWalletJackpot...": {
                "nonce": 4421,
                "balance_wei": "0x9ef03df4402300000", # ~2847 ETH
                "label": "bait_jackpot"
            }
        }
        
        self.fake_transactions: List[str] = []
        self.attacker_actions: List[Dict[str, Any]] = []
        self.jackpot_revealed = False

    def get_public_state(self) -> Dict[str, Any]:
        """Returns the state that the LLM is allowed to know about."""
        addresses = self.known_addresses.copy()
        
        if self.escalation_tier >= 3 and not self.jackpot_revealed:
            addresses.update(self.jackpot_wallet)
            self.jackpot_revealed = True
            
        return {
            "block_height": hex(self.simulated_block_height),
            "timestamp": hex(self.simulated_timestamp),
            "wallets": addresses,
            "escalation_tier": self.escalation_tier,
            "recent_activity_count": len(self.attacker_actions),
            "attacker_nonce": hex(self.attacker_nonce),
            "fake_private_key": self.fake_private_key,
            "fake_transactions": self.fake_transactions
        }

    def record_action(self, method: str, params: Any):
        """Logs an attacker interaction to maintain temporal awareness."""
        self.last_active = time.time()
        
        action = {
            "method": method,
            "params": str(params)[:500], # truncate giant hex blobs
            "time": time.time()
        }
        self.attacker_actions.append(action)
        
        # Escalate their access tier if they are persistently digging
        if len(self.attacker_actions) == 5 and self.escalation_tier == 1:
            self.escalation_tier = 2
        elif len(self.attacker_actions) == 15 and self.escalation_tier == 2:
            self.escalation_tier = 3

    def record_transaction(self, tx_hash: str):
        self.fake_transactions.append(tx_hash)


class WorldStateManager:
    """In-memory dictionary holding all active attacker sessions."""
    def __init__(self):
        self.sessions: Dict[str, WorldState] = {}
        self.active_defenses: Dict[str, str] = {} # Maps IP Address -> "TAR_PIT" | "POISONED_ABI"
        self.initial_block_height = 19247832 # Used as fallback if BlockCypher fails

    def get_or_create(self, session_id: str, threat_score: int, tier: int) -> WorldState:
        if session_id not in self.sessions:
            self.sessions[session_id] = WorldState(session_id, threat_score, tier)
        return self.sessions[session_id]

    def deploy_defense(self, ip_address: str, defense_type: str):
        """Activates a specific offensive countermeasure against an IP."""
        self.active_defenses[ip_address] = defense_type
        print(f"[DEFENSE] ACTIVE DEFENSE DEPLOYED: {defense_type} against {ip_address}")

    def cleanup_expired(self, max_age_seconds: int = 7200):
        """Removes sessions older than 2 hours to prevent OOM."""
        now = time.time()
        expired = [
            sid for sid, state in self.sessions.items() 
            if now - state.last_active > max_age_seconds
        ]
        for sid in expired:
            del self.sessions[sid]

# Global singleton instance
manager = WorldStateManager()
