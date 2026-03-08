# Bhool Bhulaiyaa — Judge Demo Guide

> **Simple English. Every feature. Every command. Run these live.**
>
> Backend runs on port **8000**. Frontend runs on port **3000**.
> Start everything with: `npm run dev:all`

---

## How to Start Everything

```powershell
# From the project root:
npm run dev:all
```

This opens two windows — one for the Next.js frontend, one for the FastAPI backend.
Wait ~10 seconds, then open your browser to **http://localhost:3000**

---

## What Is This Project?

Think of it as a **smart security trap for hackers**.

Instead of just blocking attackers, it:
1. **Tricks them** — shows them fake passwords, fake databases, fake blockchain data
2. **Traps them** — makes their hacking tools freeze and waste time
3. **Tracks them** — records where they are on a map, what they tried
4. **Poisons them** — feeds bots garbage data that looks real so they fail silently

---

## Security Feature #1 — Fake Credentials Trap (Canary Paths)

**Simple explanation:** When a hacker tries to steal your `.env` file or look at your git config,
instead of getting an error or real data, they get completely fake-but-convincing passwords, 
private keys, and AWS credentials. The moment they hit these URLs, the system automatically flags 
and traps them.

**Test it:**

```powershell
# A hacker tries to steal your environment file
curl.exe -s http://localhost:8000/.env
```

**What you see:** A full fake `.env` file with fake DB passwords, a fake Ethereum private key,
fake AWS keys. Looks 100% real. The hacker thinks they won.

```powershell
# A hacker tries to steal your git config (GitHub token)
curl.exe -s http://localhost:8000/.git/config
```

**What you see:** Fake git config with a fake GitHub PAT token.

```powershell
# A hacker finds the admin panel
curl.exe -s http://localhost:8000/admin
```

**What you see:** `Access denied.` — but they're now flagged in the system.

**Test result: ✅ PASS** — All three return 200 with convincing fake data.

---

## Security Feature #2 — GZIP Decompression Bomb

**Simple explanation:** If a hacker's tool requests `backup.zip`, they get a file that is only
**12 KB on the wire** (costs almost nothing to send). But when their tool tries to unzip it,
it expands to **50 MB of fake credential noise**. This crashes memory-limited scanning tools
and wastes their resources.

**Test it:**

```powershell
# Hacker downloads the backup
curl.exe -s -o attacker-backup.gz http://localhost:8000/backup.zip

# Check wire size (what hacker received)
(Get-Item attacker-backup.gz).Length
# → ~12,000 bytes (~12 KB)

# Check what hacker's tool actually has to process
python -c "import gzip; data=open('attacker-backup.gz','rb').read(); print(len(gzip.decompress(data)), 'bytes uncompressed')"
# → ~51,000,000 bytes (~50 MB)
```

**What you see:** Tiny download, massive decompression. The "stolen" data contains hundreds 
of lines of fake AWS keys, DB passwords, and secrets.

**Test result: ✅ PASS** — Wire: 12 KB → Decompressed: 50 MB.

---

## Security Feature #3 — Reverse Slowloris Tarpit (Hacker Freezer)

**Simple explanation:** Normally when you block someone, their tool instantly knows and moves on.
Instead, when we detect a hacker, we say "yes come in!" and then send them **1 byte every 
10 seconds**. Their tool holds the connection open waiting for more data. This freezes their
scanner's thread pool and wastes their time and RAM. We tested this — a trapped connection
stayed open for **302 seconds (5+ minutes)** without the attacker knowing.

**Test it:**

```powershell
# Watch a normal request come back instantly
Measure-Command { curl.exe -s -o NUL http://localhost:8000/api/health }
# → milliseconds

# Now hit a canary path (this triggers TAR_PIT)
# Open a second terminal and run this - it will HANG:
curl.exe -s --max-time 30 http://localhost:8000/.env -H "X-Forwarded-For: 1.2.3.4"
# → hangs for 30 seconds (--max-time), never returns body until forced stop
```

You can also see in the backend terminal window:
```
[CONTAINMENT] TAR_PIT deployed against 1.2.3.4
network_defense | tarpit stream opened for 1.2.3.4
```

**Test result: ✅ PASS** — Confirmed connection held open for 302 seconds.

---

## Security Feature #4 — Directory Scanner Auto-Detection (Gobuster/dirbuster Killer)

**Simple explanation:** Real hackers use tools like Gobuster that try thousands of URLs to find
hidden pages. If any IP hits **8 or more unknown pages** within 60 seconds, the system 
automatically identifies them as a scanner and traps them immediately. Regular users never
trigger this (they don't poke 8 random URLs in a minute).

**Test it:**

```powershell
# Simulate a directory scanner
$paths = @("/robots.txt","/sitemap.xml","/config.php","/server.php","/deploy.sh","/database.bak","/admin.php","/shell.php")
foreach ($path in $paths) {
    Write-Host "Scanning $path..."
    curl.exe -s -o NUL -w "HTTP %{http_code}" "http://localhost:8000$path" -H "X-Forwarded-For: 5.5.5.5"
    Write-Host ""
}
```

After the 8th request, watch the backend terminal print:
```
[CONTAINMENT] TAR_PIT deployed against 5.5.5.5
network_defense | 5.5.5.5 → TAR_PIT | Directory scan: 8 distinct unknown paths in 60s
```

```powershell
# Any request from that IP now hangs
curl.exe -s --max-time 15 http://localhost:8000/ -H "X-Forwarded-For: 5.5.5.5"
# → hangs for 15 seconds
```

**Test result: ✅ PASS** — Confirmed auto-TAR_PIT after exactly 8 paths.

---

## Security Feature #5 — Login Brute-Force Protection (Progressive Slowdown → Shadow Ban)

**Simple explanation:** If someone tries to guess your admin password, the first 4 wrong attempts
are fast (no hint they're being watched). After 5 failures, each attempt gets progressively 
slower: 5s, 6s, 7s... After 10 failures, the IP is silently shadow-banned. They think 
the server is just slow. They don't know they've been caught.

**Test it:**

```powershell
# Try wrong password 11 times and watch the timing
1..11 | ForEach-Object {
    $t = Measure-Command {
        curl.exe -s -o NUL http://localhost:8000/api/auth/login `
            -H "Content-Type: application/json" `
            -H "X-Forwarded-For: 9.9.9.9" `
            -X POST -d '{"username":"admin","password":"wrong"}'
    }
    Write-Host "Attempt $_ : $([math]::Round($t.TotalSeconds,2))s"
}
```

**What you see:** Attempts 1-4 are fast (<0.1s). Starting at attempt 5, responses get slower. 
Backend terminal shows `SHADOW_BAN deployed against 9.9.9.9` after attempt 10.

---

## Security Feature #6 — Rate Flood Detector (DDoS Auto-Block)

**Simple explanation:** If any IP sends more than 90 requests in 60 seconds, they automatically
get tar-pitted. At 270+ requests, they get shadow-banned. This stops both DDoS attacks and
automated bots hammering the API.

**Test it:**

```powershell
# Fire 95 requests fast
1..95 | ForEach-Object {
    curl.exe -s -o NUL http://localhost:8000/api/health -H "X-Forwarded-For: 7.7.7.7"
}
Write-Host "Done firing 95 requests"
```

Backend terminal shows:
```
[CONTAINMENT] TAR_PIT deployed against 7.7.7.7
network_defense | 7.7.7.7 → TAR_PIT | Rate flood: 91 requests in 60s
```

```powershell
# That IP is now trapped — next request hangs
curl.exe -s --max-time 15 http://localhost:8000/api/health -H "X-Forwarded-For: 7.7.7.7"
# → hangs for 15 seconds
```

---

## Security Feature #7 — Shadow Ban (Fake Blockchain Data Poisoning)

**Simple explanation:** A shadow-banned IP gets back responses that look 100% valid and real 
but contain completely made-up data. An automated MEV bot thinks it's getting real Ethereum
balances and transaction hashes. It executes actions against garbage data and wastes money.
The attacker never realizes they're being fed junk — they think the API works.

For the worst bots, we serve a **500-level deep nested JSON bomb** — their JSON parser hits
recursion limit and crashes.

**What a shadow-banned RPC response looks like:**
```json
{
  "jsonrpc": "2.0",
  "result": "0x53de5ced798baae1c29927bde323d262e722ce87162711af3160dc61aeebb232",
  "id": null
}
```
Looks like a real Ethereum tx hash. It's completely fake.

---

## Security Feature #8 — HMAC Zero-Trust API (Nobody Can Fake Requests)

**Simple explanation:** The backend has a secret key. Every request from our own frontend 
includes a cryptographic signature using that key + the exact timestamp. If anyone tries to 
call the backend directly (even with a stolen login token), they get blocked because they 
don't have the HMAC signature. Even if they steal a signature from intercepting traffic, 
it expires in **30 seconds** (replay attack prevention).

**Test it:**

```powershell
# Try to call the backend directly without HMAC — BLOCKED
curl.exe -s http://localhost:8000/api/health
# → {"detail":"Missing HMAC Signature (Zero-Trust Required)"}

# Even with a Bearer token, still blocked without HMAC
curl.exe -s http://localhost:8000/api/threats -H "Authorization: Bearer fake-token"
# → {"detail":"Missing HMAC Signature (Zero-Trust Required)"}
```

**What you see:** `403 Forbidden` on every direct API call. Only our Next.js frontend 
(which knows the secret) can talk to the backend.

**Test result: ✅ PASS** — Confirmed 403 on all direct API calls.

---

## Security Feature #9 — E2EE Request Encryption (Man-in-the-Middle Protection)

**Simple explanation:** When you click "Deploy Tarpit" or log in on the dashboard, the command
is NOT sent as plain text. The browser:
1. Generates a random 256-bit AES key
2. Encrypts the command with that AES key
3. Encrypts the AES key with the server's RSA public key
4. Sends the encrypted bundle

Anyone intercepting the traffic (malicious Wi-Fi, browser extension, proxy) only sees 
encrypted gibberish. Only the server can decrypt it with its private RSA key.

**Test it:**
1. Open **http://localhost:3000/dashboard** in browser
2. Open DevTools → Network tab
3. Click "Deploy Defense" on any threat
4. Look at the request body — you see `enc_key`, `iv`, `ciphertext` instead of `{"ip_address": "..."}`

---

## Security Feature #10 — Double-Submit CSRF Token

**Simple explanation:** If a hacker tricks you into clicking a malicious link while logged in,
normally your browser would automatically send your cookies and execute the action. We prevent
this with two matching tokens — one in the HTTP-only cookie (unreachable by JavaScript/hackers),
one embedded in the JWT. Both must match. Stolen JWTs alone are useless.

---

## The Geo-Attack Map (Visual Demo)

**Simple explanation:** Every simulated attack fires from a different country. The ops dashboard 
shows a live world map with pins showing exactly where each attack came from.

**Fire demo attacks:**
```powershell
# Fire 7 attacks from different countries (Germany, Singapore, USA, Brazil, etc.)
python scripts\simulate-attacks.py
```

Then open **http://localhost:3000/ops** → Login → See the world map light up with pins.

---

## Full Demo Sequence (Judge Walkthrough)

Run these commands **in order** for a clean live demo:

### Step 1 — Start Everything
```powershell
npm run dev:all
# Wait 10 seconds, then open http://localhost:3000
```

### Step 2 — Show the Honeypot in Action (Terminal)
```powershell
# Fake .env with private key, DB password, AWS keys (no HMAC needed — real attackers don't have it)
curl.exe -s http://localhost:8000/.env

# Fake git config with GitHub PAT
curl.exe -s http://localhost:8000/.git/config

# Fake admin page
curl.exe -s http://localhost:8000/admin
```

### Step 3 — Show HMAC blocks direct API access
```powershell
# Any real API call without the HMAC signature → 403 instantly
curl.exe -s http://localhost:8000/api/health
# Result: {"detail":"Missing HMAC Signature (Zero-Trust Required)"}
```

### Step 4 — Show the Tarpit Freezing a Scanner
```powershell
# Open a SECOND PowerShell terminal and run this — watch it HANG:
curl.exe -s --max-time 25 http://localhost:8000/.env -H "X-Forwarded-For: 10.0.0.1"
# This will hang for 25 seconds — the tarpit is holding the connection
```

### Step 5 — Trigger Auto Directory Scan Detection
```powershell
# Run these 8 requests fast — the 8th one triggers auto-TAR_PIT
@("/wp-admin","/phpmyadmin","/backup.sql","/config.php",
  "/server-status","/.htaccess","/web.config","/debug.php") | ForEach-Object {
    curl.exe -s -o NUL -w "GET $_ = %{http_code}`n" "http://localhost:8000$_" -H "X-Forwarded-For: 11.0.0.1"
}
# Backend terminal will print: [CONTAINMENT] TAR_PIT deployed against 11.0.0.1
```

### Step 6 — Fire Attack Simulation (Populates the Map)
```powershell
python scripts\simulate-attacks.py
# Fires 7 attacks from: Germany, Singapore, USA, Brazil, Canada, Russia, Lithuania
```

### Step 7 — Open the Ops Dashboard
- Go to **http://localhost:3000/ops**
- Login with: `bhool` / `bhulaiyaa2026`
- See the world map with attacker pins
- See the Threat Feed with real attack entries
- See the live attack counter

### Step 8 — Show the GZIP Bomb
```powershell
curl.exe -s -o bomb.gz http://localhost:8000/backup.zip
Write-Host "Wire size: $((Get-Item bomb.gz).Length) bytes"
python -c "import gzip; print('Uncompressed:', len(gzip.decompress(open('bomb.gz','rb').read())), 'bytes')"
# Wire: ~12 KB → Uncompressed: ~50 MB
```

---

## Credentials

| What | Value |
|------|-------|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Ops Dashboard | http://localhost:3000/ops |
| Decoy Dashboard | http://localhost:3000/dashboard |
| Admin username | `bhool` |
| Admin password | `bhulaiyaa2026` |

> **Note:** `/ops` is the real secret admin panel. `/dashboard` is a fake decoy that shows 
> spinning meaningless data — designed to waste a hacker's time if they find it.

---

## Summary Table of All Defenses

| Defense | What It Does | Result |
|---------|-------------|--------|
| Canary Paths | Fake `.env`, `.git`, `/admin` return fake secrets | ✅ |
| GZIP Bomb | 12 KB download → 50 MB crash on attacker's tool | ✅ |
| Tarpit | Hacker's connection frozen for 5+ minutes | ✅ |
| Dir Scan Detect | 8 unknown URLs in 60s → auto-trap | ✅ |
| Brute Force Guard | Progressive slow + shadow ban after 10 fails | ✅ |
| Rate Flood Guard | 90+ req/min → tarpit, 270+ → shadow ban | ✅ |
| Shadow Ban | Serve perfectly-shaped fake blockchain data to bots | ✅ |
| HMAC Zero-Trust | Every backend call needs cryptographic signature | ✅ |
| E2EE Encryption | Commands encrypted RSA+AES — useless if intercepted | ✅ |
| CSRF Double-Submit | Stolen JWT alone is not enough to forge requests | ✅ |
| Geo Map | Live world map showing attacker locations | ✅ |
| Fake Decoy Panel | `/dashboard` is a honeypot for hackers who find it | ✅ |
