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

# Additional fake secret files to trap reconnaissance scripts.
FAKE_GIT_CONFIG_RESPONSE = """
[core]
        repositoryformatversion = 0
        filemode = true
        bare = false
        logallrefupdates = true
[remote \"origin\"]
        url = https://ghp_9mA7x2qf7cK1Rk2A8vLQfYdXnD0wA9EXAMPLE@github.com/acme/crown-jewel.git
        fetch = +refs/heads/*:refs/remotes/origin/*
[branch \"main\"]
        remote = origin
        merge = refs/heads/main
"""

FAKE_AWS_CREDENTIALS_RESPONSE = """
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
region = us-east-1

[prod-admin]
aws_access_key_id = AKIAT3STSECURITYFAKE
aws_secret_access_key = 8YfQ0z8mW1dA3x9lK2pN7hV5bR4uQ1tZEXAMPLE
region = eu-west-1
"""

FAKE_WP_CONFIG_RESPONSE = """
<?php
define('DB_NAME', 'wp_prod');
define('DB_USER', 'wp_admin');
define('DB_PASSWORD', 'A9xkQm2vP4tR7sL1');
define('DB_HOST', '10.12.9.44');
define('AUTH_KEY', 'faKE-auTh-kEy-2026-long-string');
define('SECURE_AUTH_KEY', 'faKE-seCuRe-auTh-kEy-2026-long-string');
define('LOGGED_IN_KEY', 'faKE-loGGed-in-kEy-2026-long-string');
define('NONCE_KEY', 'faKE-noNce-kEy-2026-long-string');
?>
"""

FAKE_DOCKER_COMPOSE_RESPONSE = """
version: '3.9'
services:
    app:
        image: registry.internal/acme-admin:2026.03.01
        environment:
            - JWT_SECRET=prod-jwt-secret-rotated-weekly
            - DATABASE_URL=postgres://admin:K9mQp2LxR@postgres:5432/prod
            - REDIS_URL=redis://:S3cr3tPass@redis:6379/0
        ports:
            - "8080:8080"
"""

FAKE_PRIVATE_KEY_RESPONSE = """
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAIEA1wqE5W4zQx9nO7kVY2D8x3cQmA6k2f7oQf0G3i7VQ2t5nZPq7m8d
W0xV6cQ3Y9f8S1gkR2m1yJ7lA9dQ6v3nM2pT5yL8wB3fS4xZ9uE6qR3dX8mN1kJ2pL6rV4
zY0kQ3pV7nF2mD9xS8bA5cN6wE7rQ8tY1uI2oP3lM4nQ5rS6tU7vW8xY9z0AAABiYXR0YWN
rZXJfYmFpdF9rZXkAAAAHc3NoLXJzYQAAAIEA1wqE5W4zQx9nO7kVY2D8x3cQmA6k2f7oQ
f0G3i7VQ2t5nZPq7m8dW0xV6cQ3Y9f8S1gkR2m1yJ7lA9dQ6v3nM2pT5yL8wB3fS4xZ9uE6
qR3dX8mN1kJ2pL6rV4zY0kQ3pV7nF2mD9xS8bA5cN6wE7rQ8tY1uI2oP3lM4nQ5rS6tU7vW
8xY9z0AAAADAQABAAAAgQCZk4mP8qQ1rF7vL2xN5tJ9wE3sD6yH8mB4qR1uV7nC2pX5tK
9yQ6wE2rM8nL4fD1sG7hJ3kP5qR9tV2wX6yZ0aB3cD7eF1gH5jK9lM2nP6qR0sT4uV8wX2
Y6zA0bC4dE8fG2hJ6kL0mN4pQ8rS2tU6vX0yZ3aB7cD1eF5gH9iJ3kL7mN1oQ==
-----END OPENSSH PRIVATE KEY-----
"""

FAKE_FILE_RESPONSES = {
        ".env": FAKE_ENV_RESPONSE,
        ".env.local": FAKE_ENV_RESPONSE,
        ".git/config": FAKE_GIT_CONFIG_RESPONSE,
        ".aws/credentials": FAKE_AWS_CREDENTIALS_RESPONSE,
        "wp-config.php": FAKE_WP_CONFIG_RESPONSE,
        "config.php": FAKE_WP_CONFIG_RESPONSE,
        "docker-compose.yml": FAKE_DOCKER_COMPOSE_RESPONSE,
        "id_rsa": FAKE_PRIVATE_KEY_RESPONSE,
}

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
