"""
Constants and Pre-generated Fake Data for the Honeypot System.
These strings simulate realistic vulnerabilities specifically 
to bait automated attack tooling into wasting compute cycles.
"""

# The fake .env file served to attackers probing the filesystem
FAKE_ENV_RESPONSE = """
# =========================================================================
# SYSTEM ENVIRONMENT VARIABLES (INTERNAL)
# BE CAREFUL NOT TO COMMIT THIS FILE
# =========================================================================

NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn

# ---------------------------------------------------------
# DATABASE INFRASTRUCTURE
# ---------------------------------------------------------
# Main PostgreSQL instance for transaction metadata
DATABASE_URL=postgresql://admin:Xk9mP2qL@db.internal:5432/ethereum_prod_v4
DB_POOL_SIZE=100
DB_TIMEOUT_MS=5000

# Redis caching layer for mempool and real-time gas prices
REDIS_URL=redis://:RpQ7nM3vK@cache.internal:6379/1
REDIS_TTL=3600

# ---------------------------------------------------------
# ETHEREUM NODE CONNECTIVITY
# ---------------------------------------------------------
# Warning: Keep keys rotated every 90 days
INFURA_PROJECT_ID=a1b2c3d4e5f6789012345678901234ab
INFURA_API_SECRET=e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1
ALCHEMY_API_KEY=alch_prod_Xm9kP2qL7nM3vK8j
WEB3_HTTP_PROVIDER=https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}
WEB3_WSS_PROVIDER=wss://mainnet.infura.io/ws/v3/${INFURA_PROJECT_ID}

# =========================================================
# CRITICAL: HOT WALLET KEYS
# These keys control operational funds for gas sweeping.
# DO NOT EXPOSE TO UN-TRUSTED VMS.
# =========================================================
# Main Hot Wallet (Auto-tops up from cold storage daily)
HOT_WALLET_ADDRESS=0x71C7656EC7ab88b098defB751B7401B5f6d8976F
# Formatted correctly, but mathematically impossible/invalid 
HOT_WALLET_PRIVATE_KEY=0x4c0883a69102937d6231471b5dbb6e538ebe4982

# =========================================================
# APPLICATION SECRETS
# =========================================================
ADMIN_JWT_SECRET=bb-admin-2026-Xk9m
JWT_EXPIRY=24h
SESSION_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature
CORS_ORIGINS=https://app.bb-security.com,https://api.bb-security.com

# External Integrations
STRIPE_SECRET_KEY=sk_live_Xk9mP2qLRpQ7nM3vK8j
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
S3_BUCKET_NAME=bb-prod-backups-secure-2024
"""

# Common attack payloads to look out for
SQL_INJECTION_PATTERNS = [
    "' OR '1'='1",
    "UNION SELECT",
    "DROP TABLE",
    "' OR 1=1--",
    "' AND 1=1--",
]

PATH_TRAVERSAL_PATTERNS = [
    "../",
    "%2e%2e%2f",
    "/etc/passwd",
    "boot.ini",
    "windows/win.ini",
]

# Signatures for specific attack tools based on User-Agent
KNOWN_ATTACK_TOOLS = {
    "curl": "curl/wget",
    "python-requests": "Python/Requests",
    "Go-http-client": "Go Scraper",
    "Nuclei": "Nuclei Vulnerability Scanner",
    "zgrab": "ZGrab Internet Scanner",
    "masscan": "Masscan",
    "PhantomJS": "Headless PhantomJS",
    "HeadlessChrome": "Playwright/Puppeteer",
}

# The fallback dictionary matching requests to fake responses if LLM fails
STATIC_RPC_LIBRARY = {
    "net_version": "1",
    "eth_chainId": "0x1",
    "eth_syncing": False,
    "web3_clientVersion": "Geth/v1.10.26-omnibus/linux-amd64/go1.18.5",
    "eth_gasPrice": "0x4a817c800", # 20 gwei
    "eth_blockNumber": "0x125a2fa",
    "eth_accounts": [
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    ],
}
