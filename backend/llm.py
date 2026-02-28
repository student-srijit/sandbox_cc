import json
import logging
import aiohttp
import re
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
        return _fallback_static_response(payload_text)
        
    return response_obj

def _fallback_static_response(payload: str) -> Dict[str, Any]:
    """Provides a realistic fallback if the Generative AI is offline."""
    try:
        req = json.loads(payload)
        method = req.get("method", "")
        req_id = req.get("id", 1)
        
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
