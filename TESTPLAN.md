# Active Defense — Human-Verifiable Test Plan

Each test below is a **manual scenario**: you run the commands yourself, read the
output, and judge pass/fail with your own eyes.  No automation hides what's happening.

---

## Prerequisites

### 1. Start the backend in proxy-aware mode

Open a terminal and run:

```bash
cd backend
TRUST_PROXY_HEADERS=true ./venv/bin/python -m uvicorn main:app --port 8001
```

> We use port **8001** (not 8000) so this test server doesn't conflict with any
> existing running instance.  `TRUST_PROXY_HEADERS=true` lets us spoof
> `X-Forwarded-For` below to simulate an external IP from your own machine.
> Without it, all requests come from `127.0.0.1` which is whitelisted by design.

### 2. Get a Defender JWT (for protected endpoints)

```bash
curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password-here"}' | python3 -m json.tool
```

Copy the `token` value.  Set it as a shell variable for convenience:

```bash
TOKEN="<paste token here>"
```

---

## TC-1 · Canary Path — Fake Credential Response

> **What it proves:** Hitting a honeypot path like `/.env` returns believable fake data
> instead of a 404, and silently registers the attacker in the containment list.

### Steps

**Step 1** — Hit a canary path cold:

```bash
curl -i http://localhost:8001/.env \
  -H "X-Forwarded-For: 203.0.113.10"
```

**Observe:**
- HTTP status is `200 OK`
- Body contains fake env vars:
  ```
  APP_ENV=production
  DB_PASSWORD=
  SECRET_KEY=
  ```
  (Looks real enough that a scanner would log it and try to use the values.)

**Step 2** — Check the containment list to confirm the IP was registered:

```bash
curl -s http://localhost:8001/api/network/stats \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Observe:**
- Under `"scanner_paths"` or the logs printed in the uvicorn terminal, you will see
  `203.0.113.10` with a `TAR_PIT` containment event logged.

### Pass Criteria
- [x] `200 OK` with fake credential text in body
- [x] Uvicorn log prints `[CONTAINMENT] TAR_PIT deployed against 203.0.113.10`

---

## TC-2 · GZIP Decompression Bomb

> **What it proves:** A scanner requesting `backup.zip` or `config.json` receives
> ~50 KB on the wire that expands to ~50 MB when decompressed — wasting memory and
> burn time on the attacker's machine.

### Steps

**Step 1** — Request the backup canary:

```bash
curl -i http://localhost:8001/backup.zip \
  -H "X-Forwarded-For: 203.0.113.20" \
  -o /tmp/attacker-got-backup.gz
```

**Observe in the headers printed to screen:**
```
Content-Encoding: gzip
Content-Disposition: attachment; filename="backup.zip"
```

**Observe the file size on disk (compressed — what the attacker received):**
```bash
ls -lh /tmp/attacker-got-backup.gz
```
Should be **~40–60 KB**.

**Step 2** — Decompress it to see what the attacker's tool sees:

```bash
gunzip -c /tmp/attacker-got-backup.gz | wc -c
```

**Observe:**
- Output is approximately `52,000,000` bytes (~50 MB of fake credential noise).

**Step 3** — Look at a sample of what the "stolen" data looks like:

```bash
gunzip -c /tmp/attacker-got-backup.gz | head -20
```

**Observe:**
- Lines of `DB_PASSWORD=`, `SECRET_KEY=aaa...`, `AWS_ACCESS_KEY_ID=AKIA...`
  that look exactly like real leaked credentials but contain no real values.

### Pass Criteria
- [x] Wire size < 200 KB (compressed)
- [x] Decompressed size ≥ 40 MB
- [x] Content looks like real leaked secrets (fake values)

---

## TC-3 · Reverse Slowloris Tarpit (Byte Drip)

> **What it proves:** Once an IP is in TAR_PIT mode, every subsequent request gets
> a streaming response that sends 1 null byte every 10 seconds, holding the
> scanner's socket open and consuming its thread pool.

### Steps

**Step 1** — First, manually force the IP into TAR_PIT via the defend endpoint:

```bash
curl -s -X POST http://localhost:8001/api/dashboard/defend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip_address":"203.0.113.30","defense_type":"TAR_PIT","threat_id":"test-tc3"}'
```

**Observe:** `{"status": "deployed", ...}` or similar success JSON.

**Step 2** — Now simulate the attacker making any request from that IP:

```bash
time curl -i http://localhost:8001/api/health \
  -H "X-Forwarded-For: 203.0.113.30" \
  --max-time 35
```

**Observe while it runs (this will hang — that is correct):**
- The curl prompt does NOT immediately return.
- The uvicorn terminal prints:
  ```
  network_defense | tarpit stream opened for 203.0.113.30
  ```
- After `--max-time 35` the curl times out with exit code 28.
- The `time` command will show ~35 seconds elapsed — proving a 35-second socket hold.

**Step 3** — Show that the real defender IP (your actual machine via `127.0.0.1`) is unaffected:

```bash
curl -i http://localhost:8001/api/health
```

**Observe:** Returns `{"status":"ok"}` instantly — no hang, no tarpit.

### Pass Criteria
- [x] Attacker request hangs for the full `--max-time` duration
- [x] Real requests (no `X-Forwarded-For`) respond instantly
- [x] Uvicorn logs the tarpit event

---

## TC-4 · Login Brute-Force — Progressive Slow-Down → SHADOW_BAN

> **What it proves:** After 5 bad logins the server begins adding a delay.
> After 10 it locks the IP out silently.

### Steps

**Step 1** — Send 5 wrong password requests and measure response time:

```bash
for i in $(seq 1 5); do
  echo -n "Attempt $i: "
  time curl -s -X POST http://localhost:8001/api/auth/login \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.40" \
    -d '{"username":"admin","password":"wrongpassword"}' > /dev/null
done
```

**Observe:**
- Attempts 1–5 return quickly (< 0.1s each).
- Starting around attempt 5, the response time begins increasing (1s, 2s, ...).
- The response headers include `X-BB-Login-Lockout: 5` (or higher).

**Step 2** — Keep going past 10:

```bash
for i in $(seq 6 11); do
  echo -n "Attempt $i: "
  time curl -s -X POST http://localhost:8001/api/auth/login \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.40" \
    -d '{"username":"admin","password":"wrongpassword"}'
done
```

**Observe:**
- Attempts 6–10 each take progressively longer (2s, 3s, ...).
- After attempt 10, the uvicorn terminal prints:
  ```
  [CONTAINMENT] SHADOW_BAN deployed against 203.0.113.40
  ```

**Step 3** — Confirm the IP is now in SHADOW_BAN (any further request returns fake data):

```bash
curl -s http://localhost:8001/api/network/stats \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -A2 "203.0.113.40"
```

### Pass Criteria
- [x] First 4 attempts: < 0.3s each
- [x] Attempt 5+: visibly increasing delay
- [x] Attempt 10: uvicorn logs SHADOW_BAN deployment
- [x] `X-BB-Login-Lockout` header appears in responses during slow-down phase

---

## TC-5 · Directory Scan Detector

> **What it proves:** An IP hitting 8+ unknown paths in 60 seconds is automatically
> identified as running a scanner (Gobuster, feroxbuster, dirbuster) and tar-pitted.

### Steps

**Step 1** — Simulate a typical dirbuster wordlist pattern (10 distinct junk paths):

```bash
for path in /robots.txt /sitemap.xml /config.php /server.php \
            /deploy.sh /database.bak /admin.php /shell.php \
            /console /webshell.php; do
  echo -n "GET $path → "
  curl -s -o /dev/null -w "%{http_code}\n" \
    "http://localhost:8001$path" \
    -H "X-Forwarded-For: 203.0.113.50"
done
```

**Observe:**
- Most paths return `404`.
- Uvicorn terminal shows, after the 8th distinct 404:
  ```
  [CONTAINMENT] TAR_PIT deployed against 203.0.113.50
  network_defense | Directory scan: 8 distinct unknown paths in 60s
  ```

**Step 2** — Confirm subsequent requests from that IP are tarpitted:

```bash
time curl -i http://localhost:8001/api/health \
  -H "X-Forwarded-For: 203.0.113.50" \
  --max-time 15
```

**Observe:** Request hangs for the full 15s (tarpit active), then times out.

**Step 3** — Confirm `/api/` paths do NOT count toward the scan threshold:

Start fresh with a new fake IP and hit 10 known API paths:

```bash
for path in /api/health /api/status /api/dashboard/public-stats \
            /api/threats /api/ledger /api/telemetry \
            /api/simulate /api/system-health /api/protect /api/replay; do
  curl -s -o /dev/null -w "%{http_code} $path\n" \
    "http://localhost:8001$path" \
    -H "X-Forwarded-For: 203.0.113.51"
done
```

**Observe:** No TAR_PIT deployed for `203.0.113.51` — `/api/` paths are whitelisted.

### Pass Criteria
- [x] 8 non-API 404s triggers TAR_PIT for the scanning IP
- [x] Subsequent requests from scanner IP hang
- [x] 10 `/api/` path 404s do NOT trigger confinement

---

## TC-6 · Rate Flood Detector

> **What it proves:** An IP sending more than 90 requests in 60 seconds is automatically
> tar-pitted; at 270+ requests it is shadow-banned.

### Steps

**Step 1** — Send 95 requests rapidly:

```bash
for i in $(seq 1 95); do
  curl -s -o /dev/null \
    http://localhost:8001/api/health \
    -H "X-Forwarded-For: 203.0.113.60"
done
echo "Done"
```

**Observe in uvicorn terminal:**
```
[CONTAINMENT] TAR_PIT deployed against 203.0.113.60
network_defense | 203.0.113.60 → TAR_PIT | Rate flood: 91 requests in 60s
```

**Step 2** — Confirm the next request from that IP hangs:

```bash
time curl http://localhost:8001/api/health \
  -H "X-Forwarded-For: 203.0.113.60" \
  --max-time 15
```

**Observe:** Hangs for 15s.

**Step 3** (optional, takes ~2 min) — Reset and send 275 requests to trigger SHADOW_BAN:

```bash
# Wait 61 seconds first to clear the rate window, then flood
sleep 61
for i in $(seq 1 275); do
  curl -s -o /dev/null \
    http://localhost:8001/api/health \
    -H "X-Forwarded-For: 203.0.113.61"
done
```

**Observe in uvicorn:**
```
[CONTAINMENT] SHADOW_BAN deployed against 203.0.113.61
network_defense | 203.0.113.61 → SHADOW_BAN | Rate flood: 271 requests in 60s (ban threshold)
```

### Pass Criteria
- [x] 95 requests → TAR_PIT log + subsequent request hangs
- [x] 275 requests → SHADOW_BAN log

---

## TC-7 · Cryptographic Shadow-Ban (Data Poisoning)

> **What it proves:** An IP in SHADOW_BAN mode receives valid-looking JSON-RPC
> responses that contain completely fabricated data — fake tx hashes, wrong balances.
> The bot consumes the data thinking it succeeded.

### Steps

**Step 1** — Force the IP into SHADOW_BAN:

```bash
curl -s -X POST http://localhost:8001/api/dashboard/defend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip_address":"203.0.113.70","defense_type":"SHADOW_BAN","threat_id":"test-tc7"}'
```

**Step 2** — Send an RPC call from the shadow-banned IP:

```bash
curl -s -X POST http://localhost:8001/api/rpc \
  -H "Content-Type: application/json" \
  -H "X-BB-Tier: BOT" \
  -H "X-Forwarded-For: 203.0.113.70" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xdeadbeef",  "latest"],"id":1}' \
  | python3 -m json.tool
```

**Observe:**
- Response is `200 OK`
- Body is valid JSON-RPC format: `{"jsonrpc": "2.0", "result": "0x<64 random hex chars>", "id": null}`
- The `result` looks exactly like a real Ethereum tx hash or balance
- **But it's pure random garbage** — a real MEV bot logs this and executes a transaction against it

**Step 3** — Compare with a POISONED_ABI response:

```bash
curl -s -X POST http://localhost:8001/api/dashboard/defend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip_address":"203.0.113.71","defense_type":"POISONED_ABI","threat_id":"test-tc7b"}'

curl -s -X POST http://localhost:8001/api/rpc \
  -H "Content-Type: application/json" \
  -H "X-BB-Tier: BOT" \
  -H "X-Forwarded-For: 203.0.113.71" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[],"id":1}' \
  | python3 -m json.tool 2>&1 | head -30
```

**Observe:**
- The JSON output starts printing nested `{"payload": {"payload": ...}}` — 500 levels deep.
- `python3 -m json.tool` will either print thousands of lines or hit Python's recursion limit.
  Either way, a real parser on the attacker's machine would exhaust its stack.

### Pass Criteria
- [x] SHADOW_BAN: response is syntactically valid JSON-RPC with a fake hex result
- [x] POISONED_ABI: response contains deeply-nested structure visible in output

---

## TC-8 · /api/network/stats — Live Defense Dashboard

> **What it proves:** The diagnostic endpoint gives real-time visibility into which
> IPs are currently being defended and with what intensities.

### Steps

**Step 1** — After running TC-1 through TC-6 above, query the stats:

```bash
curl -s http://localhost:8001/api/network/stats \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

**Observe:** A JSON structure like:

```json
{
  "rate_limiter": {
    "203.0.113.60": 95
  },
  "login_failures": {
    "203.0.113.40": 11
  },
  "scanner_paths": {
    "203.0.113.50": 10
  },
  "config": {
    "rate_limit_window_seconds": 60,
    "rate_limit_threshold": 90,
    "login_soft_limit": 5,
    "login_hard_limit": 10,
    "scan_path_threshold": 8
  }
}
```

All the IPs from previous test cases should appear in the relevant counters.

**Step 2** — Confirm the endpoint requires authentication:

```bash
curl -i http://localhost:8001/api/network/stats
```

**Observe:** Returns `401 Unauthorized` — no token, no data.

### Pass Criteria
- [x] Authenticated request returns live per-IP counters
- [x] Unauthenticated request returns `401`
- [x] All test-case IPs appear in correct counters

---

## Cleanup

Kill the test server with `Ctrl+C` in its terminal.

The in-memory containment state is not persisted — restarting the server
resets all active containments back to zero (existing SQLite threat log entries
are preserved).
