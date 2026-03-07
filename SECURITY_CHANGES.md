# 🛡️ Advanced Security & Active Defense Upgrades

This document outlines the advanced network-layer and application-layer security mechanisms recently implemented in the Bhool Bhulaiyaa Threat Intelligence Server. These features go beyond standard SaaS wrappers to provide production-grade, zero-trust security and proactive retaliation against attackers.

## 1. The Reconnaissance Trap (Reverse Slowloris Tarpit)

**The Attack:** Real hackers don't click buttons; they use automated tools like Nmap, ZMap, or Masscan to aggressively scan millions of IPs for open ports and hidden directories.
**The Defense:** Instead of returning a standard `403 Forbidden` or dropping the connection (which tells the hacker the server exists and to try other vectors), we implemented a **Reverse Slowloris Tarpit** at the Python backend.
- When an automated scanner or suspicious IP hits our `catch_all` route or triggers a "TAR_PIT" containment playbook, we accept the TCP connection and return a `200 OK` header to keep the scanner hopeful.
- We then drip-feed exactly **1 byte of garbage data every 10 seconds**.
**How it Blocks Hackers:** This forces the hacker's automated scanner to keep the socket open indefinitely. By hanging the connection, we consume the RAM and thread pools of the attacker's machine, effectively breaking their scanning tools and wasting their resources without them realizing it.

**How to Test:**
1. Use an automated tool or simply `curl` to hit a protected or fake endpoint (e.g., a known malicious probe or an IP placed in TAR_PIT mode).
2. Example script: `curl -v http://localhost:8000/.env` or trigger the Tarpit via the dashboard containment controls.
3. You will see the connection hang after the initial headers, receiving 1 byte every 10 seconds.

---

## 2. Double-Submit Anti-CSRF Authentication Token

**The Attack:** Cross-Site Request Forgery (CSRF). A hacker tricks an authenticated admin into clicking a malicious link, forcing their browser to execute unwanted actions (like dropping defenses) on our API.
**The Defense:** We implemented the robust "Double-Submit Cookie" pattern.
- Upon login, the FastAPI backend dynamically generates a cryptographically secure 32-byte string (`secrets.token_urlsafe(32)`).
- This token is both set as a strict, `HttpOnly`, `Secure` cookie (`bb_csrf_token`) *and* embedded into the JWT token claims.
- The Next.js API proxy routes automatically forward this cookie.
- Every protected backend API request triggers the `verify_auth_and_csrf` middleware, which extracts the JWT, reads the HttpOnly cookie, and cryptographically verifies they match.
**How it Blocks Hackers:** Even if a hacker successfully steals the JWT from `localStorage` or executes an XSS attack, they cannot read or spoof the `HttpOnly` cookie. Without both matching components, the backend drops the request.

**How to Test:**
1. Log in to the dashboard.
2. Inspect your browser's Application/Network tab. You will see the `bb_csrf_token` cookie set as `HttpOnly`.
3. Try making an API request to `/api/dashboard` using Postman with only the Bearer token (no cookie). The request will be rejected.

---

## 3. Edge-Level Request Encryption (E2EE/JWE)

**The Attack:** Man-in-the-Middle (MitM) attacks. Compromised Wi-Fi networks or malicious browser extensions intercepting raw JSON payloads.
**The Defense:** True Hybrid-Encryption architecture using the Native Web Crypto API.
- Sensitive SOC commands (like login credentials or deploying active defenses) are never sent as plaintext JSON.
- The browser dynamically generates a one-time **256-bit AES-GCM** key.
- The payload is encrypted with this AES key.
- The AES key is then encrypted using the FastAPI backend's **Public RSA-OAEP** key.
- The Next.js frontend sends this `E2EEWrapper` payload to the backend.
- The Python backend uses the `cryptography` library and its Private RSA key to securely unwrap the AES key, and then decrypts the raw JSON payload.
**How it Blocks Hackers:** Anyone intercepting the traffic between the browser and the Next.js edge, or Next.js and FastAPI, will only see encrypted gibberish. Since the AES key is encrypted via RSA, only the backend holds the private key required to decrypt it.

**How to Test:**
1. Open the Network tab in your browser.
2. Perform a login or deploy a defense (e.g., click "DEPLOY TAR-PIT").
3. Inspect the request payload. You will not see raw JSON (like `{"ip_address": "..."}`). Instead, you will see `enc_key`, `iv`, and `ciphertext`.

---

## 4. API HMAC Signature Verification

**The Attack:** Direct network probing. Attackers bypass the Next.js frontend (where rate-limiting and normal routing live) and directly spam the internal Python FastAPI port (e.g., port 8000) with forged requests or Replay Attacks.
**The Defense:** Zero-Trust API Proxy Communication.
- We modified the Next.js `backend-config.ts` to wrap all backend requests.
- Next.js calculates a real **HMAC-SHA256** hash (the `X-BB-Signature`) combining a shared `API_SECRET`, a precise Unix timestamp, and the request body.
- The FastAPI backend router strictly enforces the `verify_hmac_signature` middleware globally. 
- It recalculates the hash and uses `hmac.compare_digest` to prevent timing/side-channel attacks.
**How it Blocks Hackers:** 
1. If a hacker hits port 8000 directly without the secret-derived signature, they are instantly blocked (`403 Forbidden`).
2. Even if a hacker intercepts a valid signed request and tries to "replay" it later to spam the endpoint, the backend checks the timestamp. If the timestamp is older than **30 seconds**, the request is rejected as a Replay Attack.

**How to Test:**
1. Try sending a `GET` request directly to the FastAPI server (`http://localhost:8000/api/dashboard`) using Postman or `curl`.
2. Even if you include a valid `Bearer` token and CSRF cookie, the request will fail with a `403 Forbidden: Missing HMAC Signature`.
3. Only the Next.js frontend, which possesses the `API_SECRET` and generates valid temporal signatures, can successfully communicate with the backend.
