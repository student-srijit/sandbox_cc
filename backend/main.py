import time
import random
import logging
import asyncio
import aiohttp
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db
from router import router, open_router
from world_state import manager
from network_defense import ActiveDefenseMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bhool-bhulaiyaa")

async def background_block_incrementer():
    """Continuously increments simulated block heights for all active sessions every 12s."""
    while True:
        await asyncio.sleep(12)
        for state_obj in manager.sessions.values():
            state_obj.simulated_block_height += 1
            state_obj.simulated_timestamp += 12

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing Polymorphic Honeypot Engine...")
    init_db()
    logger.info("Local SQLite Threat Cache online.")
    
    # Pre-fetch the real current block height so our simulated world starts exactly in sync
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("https://api.blockcypher.com/v1/eth/main", timeout=5) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    manager.initial_block_height = data.get("height", 19247832)
                    logger.info(f"Synchronized baseline LLM state to real Ethereum Mainnet Height: {manager.initial_block_height}")
    except Exception as e:
        logger.warning(f"Failed to fetch live block height, defaulting to 19247832: {e}")
        
    # Spin up the background clock for perfect statefulness continuity
    asyncio.create_task(background_block_incrementer())
    
    # We don't strictly require Ollama to boot up, because our Fallback logic
    # handles LLaMA downtime seamlessly.
    logger.info("Honeypot Systems Nominal. Listening on port 8000.")
    
    yield
    
    # Shutdown (if needed)

app = FastAPI(
    title="Bhool Bhulaiyaa Threat Intelligence Server",
    description="Backend honeypot telemetry and execution client spoofing engine.",
    lifespan=lifespan,
    # We disable the docs generation because attackers probe for /docs to fingerprint FastAPI
    docs_url=None, 
    redoc_url=None
)

# 1. CORS Configuration
# Next.js frontend calls us directly if running locally or via proxied domain
def _parse_allowed_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOW_ORIGINS", "")
    if configured.strip():
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-BB-Threat-Score", "X-BB-Tier", "X-BB-Session"],
)

# 2b. Network-Layer Active Defense Middleware
# Runs after CORS (so OPTIONS pre-flights are never rate-limited) but before
# route handlers — handles per-IP rate limiting, login brute-force lockout,
# and directory scan detection, automatically feeding the ContainmentOrchestrator.
app.add_middleware(ActiveDefenseMiddleware)

# 2. Global Request Timing & Cleanup Middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    
    # Process the request
    response = await call_next(request)
    
    # Inject timing headers
    process_time = time.time() - start_time
    # Note: We deliberately add "X-Geth-Response-Time" to sell the illusion
    # and hide the fact that we are a FastAPI Python server.
    response.headers["X-Geth-Response-Time"] = str(process_time)
    
    # Background cleanup of dead sessions every few requests
    if random.random() < 0.1:
        manager.cleanup_expired()
        
        # Flush dormant intelligence dossiers to SQLite so they appear on the dashboard map
        from intelligence import intel_logger
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        expired_sessions = []
        
        for sess_id, record in intel_logger.active_threats.items():
            last_active_str = record.timeline.get("last_active", "").replace("Z", "+00:00")
            try:
                last_active = datetime.fromisoformat(last_active_str).replace(tzinfo=None)
                if now - last_active > timedelta(seconds=10):
                    expired_sessions.append(sess_id)
            except:
                expired_sessions.append(sess_id)
                
        for sess_id in expired_sessions:
            intel_logger.finalize_session(sess_id)
        
    return response

# 3. Mount Routes
app.include_router(router)
# Public honeypot-facing routes — no HMAC required (attacker-visible).
# Must be included AFTER the protected router so specific /api/* routes
# are matched first; the catch-all /{full_path:path} only fires last.
app.include_router(open_router)

if __name__ == "__main__":
    import uvicorn
    import random
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
