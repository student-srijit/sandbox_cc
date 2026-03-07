import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST() {
    try {
        // 1. Run the trusted Python sequence injector script to bypass Next.js middleware JWT scopes
        await execAsync(`
cat << 'EOF' > /tmp/sim_trap.py
import requests, time, random
s = requests.Session()
API_BASE = "http://localhost:8000/api/rpc"
ips = ['103.28.41.219', '185.220.101.44', '45.148.10.92', '91.132.147.55', '176.111.174.31', '3.8.14.0', '13.238.29.0']
random_ip = random.choice(ips)
session_id = f"BB-SIM-{int(time.time())}"
headers = {
    "Content-Type": "application/json", 
    "X-BB-Threat-Score": "100", 
    "X-BB-Tier": "BOT", 
    "X-BB-Session": session_id, 
    "X-Forwarded-For": random_ip,
    "User-Agent": "Mozilla/5.0 Playwright"
}
for i, m in enumerate(["eth_chainId", "eth_accounts", "eth_getBalance", "eth_sendTransaction"]):
    params = ["0x1", "latest"] if m == "eth_getBalance" else ([{"from":"0x1", "to":"0x2"}] if m == "eth_sendTransaction" else [])
    s.post(API_BASE, json={"jsonrpc":"2.0","method":m,"params":params,"id":i+1}, headers=headers)
requests.post("http://localhost:8000/api/flush")
print(session_id)
EOF
python3 /tmp/sim_trap.py
        `)

        // 2. Query the SQLite database directly for the newly generated TR-ID
        const dbQueryCmd = `sqlite3 backend/data/honeypot.db "SELECT id FROM threat_logs WHERE json_extract(full_record, '$.session_id') LIKE 'BB-SIM-%' ORDER BY timestamp DESC LIMIT 1;"`
        const { stdout, stderr } = await execAsync(dbQueryCmd)

        const threatId = stdout.trim()

        if (!threatId || threatId.length < 5) {
            console.error("SQLite Query failed or returned empty: ", stderr)
            return NextResponse.json({ error: "Failed to locate flushed Threat ID in DB" }, { status: 500 })
        }

        return NextResponse.json({ success: true, threatId })

    } catch (err) {
        console.error("Failed to execute simulated trap sequence via Python:", err)
        return NextResponse.json({ error: "Internal Sequence Failure" }, { status: 500 })
    }
}
