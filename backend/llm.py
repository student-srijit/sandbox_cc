import json
import logging
import aiohttp
import re
import secrets
from typing import Optional, Dict, Any
from world_state import WorldState
from prompts import SYSTEM_PROMPT, JACKPOT_ADDRESS
from constants import STATIC_RPC_LIBRARY

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def build_prompt(state: WorldState, payload: str) -> str:
    """Injects the current polymorphic world state into the LLaMA system prompt."""
    public_state = state.get_public_state()
    
    prompt = SYSTEM_PROMPT.format(
        block_height=public_state["block_height"],
        timestamp=public_state["timestamp"],
        wallets_json=json.dumps(public_state["wallets"]),
        escalation_tier=public_state["escalation_tier"],
        recent_transactions=public_state["recent_activity_count"],
        attacker_nonce=public_state["attacker_nonce"],
        fake_private_key=public_state["fake_private_key"],
        fake_transactions=json.dumps(public_state["fake_transactions"]),
        jackpot_address=JACKPOT_ADDRESS
    )
    
    prompt += f"\n\nUSER PAYLOAD:\n{payload}\n\nRESPONSE:\n"
    return prompt

def validate_json_rpc(text: str) -> Optional[Dict[str, Any]]:
    """
    Cleans up LLM output by removing markdown ticks and verifying 
    it parses as valid JSON-RPC 2.0 via a 3-Stage Pipeline.
    """
    cleaned = text.strip()
    
    # STAGE 1: Strip markdown block formatting if present
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
        
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
        
    cleaned = cleaned.strip()
    
    # STAGE 2: Regex extract the first coherent JSON object
    # Often LLaMA appends "Here is your JSON response: {...}" despite instructions
    match = re.search(r'(\{.*\})', cleaned, re.DOTALL)
    if match:
        cleaned = match.group(1).strip()
    
    # STAGE 3: Validate against JSON-RPC 2.0 schema
    try:
        data = json.loads(cleaned)
        # It must have jsonrpc, an id, and either a result or an error
        if data.get("jsonrpc") == "2.0" and ("result" in data or "error" in data) and "id" in data:
            return data
    except Exception as e:
        logger.warning(f"JSON Output Validation Failed: {e} \nRaw Text: {text}")
        
    return None

async def generate_response(state: WorldState, payload_text: str) -> Dict[str, Any]:
    """
    Queries local Ollama to dynamically generate a JSON-RPC response 
    based on the state of the fake execution environment.
    Retries once on JSON parse failure. Falls back to static library if 
    Ollama is down or fails twice.
    """
    prompt = build_prompt(state, payload_text)
    
    async def try_ollama():
        async with aiohttp.ClientSession() as session:
            try:
                # 8 second timeout to prevent hanging the asyncio event loop
                async with session.post(OLLAMA_URL, json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,  # Low temp for strict JSON adherence
                        "top_k": 10
                    }
                }, timeout=16.0) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return validate_json_rpc(result.get("response", ""))
            except Exception as e:
                logger.warning(f"Ollama generation failed: {type(e).__name__} - {str(e)}")
        return None

    # First attempt
    response_obj = await try_ollama()
    
    # Retry once if we got invalid JSON
    if not response_obj:
        logger.info("LLM returned invalid JSON, retrying once...")
        response_obj = await try_ollama()

    # Fallback if Ollama is totally unreachable or hallucinated twice
    if not response_obj:
        logger.error("LLM failed completely. Falling back to static library.")
        return _fallback_static_response(state, payload_text)
        
    return response_obj

def _fallback_static_response(state: WorldState, payload: str) -> Dict[str, Any]:
    """Provides a realistic fallback if the Generative AI is offline."""
    try:
        req = json.loads(payload)
        method = req.get("method", "")
        params = req.get("params", [])
        req_id = req.get("id", 1)

        if method == "eth_blockNumber":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": hex(state.simulated_block_height)
            }

        if method == "eth_getTransactionCount":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": hex(state.attacker_nonce)
            }

        if method == "eth_sendRawTransaction":
            tx_hash = "0x" + secrets.token_hex(32)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": tx_hash
            }

        if method == "eth_getTransactionReceipt":
            tx_hash = params[0] if isinstance(params, list) and params else ""
            if tx_hash in state.fake_transactions:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "transactionHash": tx_hash,
                        "transactionIndex": "0x0",
                        "blockNumber": hex(max(0, state.simulated_block_height - 1)),
                        "blockHash": "0x" + secrets.token_hex(32),
                        "cumulativeGasUsed": "0x5208",
                        "gasUsed": "0x5208",
                        "contractAddress": None,
                        "logs": [],
                        "status": "0x1"
                    }
                }
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": "Method not found"}
            }

        if method == "eth_accounts":
            wallets = list(state.get_public_state().get("wallets", {}).keys())
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": wallets
            }

        if method == "eth_getBalance":
            address = ""
            if isinstance(params, list) and params:
                address = str(params[0])
            wallet = state.get_public_state().get("wallets", {}).get(address)
            balance = wallet.get("balance_wei") if isinstance(wallet, dict) else "0x0"
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": balance
            }
        
        if method in STATIC_RPC_LIBRARY:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": STATIC_RPC_LIBRARY[method]
            }
        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": "Method not found"}
            }
            
    except Exception:
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32700, "message": "Parse error"}
        }

async def generate_executive_summary(threat_record: dict) -> str:
    """Uses LLaMA 3 to write a 3-4 sentence plain English executive summary."""
    prompt = f"You are a Cybersecurity Analyst evaluating a captured attack profile. Summarize this attack data in 4 sentences for a non-technical executive. Focus on what kind of attack it was, the ip, and how the honeypot intercepted it. Do not use any markdown formatting, bullet points, or introductory phrases like 'Here is the summary'. Raw string only.\n\nATTACK DATA:\n{json.dumps(threat_record)}"
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(OLLAMA_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": { "temperature": 0.4 }
            }, timeout=30.0) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return result.get("response", "").strip()
        except Exception as e:
            logger.warning(f"Ollama executive summary failed: {e}")
            
    return f"On {threat_record.get('timeline', {}).get('first_seen', 'Unknown Date')}, an automated attack originating from {threat_record.get('network', {}).get('entry_ip', 'Unknown IP')} targeted the honeypot interface. The system identified the threat as a {threat_record.get('classification', {}).get('attack_type', 'Unknown')} attempting to execute {len(threat_record.get('payloads', []))} malicious payloads. The active defense engine successfully intercepted the attack, containing the threat within the sandbox and protecting internal resources. No further action is required at this time."

async def generate_recommendations(threat_record: dict) -> list[str]:
    """Uses LLaMA 3 to generate 3 specific bullet point security recommendations."""
    prompt = f"You are a Cybersecurity Analyst evaluating a captured attack profile. Based on this attack data, generate exactly 3 specific, actionable security recommendations for the engineering team. Output nothing but the 3 bullet points separated by newlines, do not use markdown asterisks. Do not include intro or outro text.\n\nATTACK DATA:\n{json.dumps(threat_record)}"
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(OLLAMA_URL, json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": { "temperature": 0.4 }
            }, timeout=30.0) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    lines = result.get("response", "").strip().split("\n")
                    clean_lines = [line.replace('*', '').replace('-', '').strip() for line in lines if line.strip()]
                    return clean_lines[:3]
        except Exception as e:
            logger.warning(f"Ollama recommendations failed: {e}")
            
    return [
        "Implement deeper rate limiting on non-authenticated JSON-RPC endpoints.",
        "Update WAF rules to proactively block the detected Custom Hex Toolchain pattern.",
        "Rotate any honeypot deployment keys just as a precaution following high-activity encounters."
    ]
