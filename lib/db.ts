import fs from 'fs'
import path from 'path'

// Using a JSON file instead of better-sqlite3 because the local machine
// has corrupted root-level permissions on node_modules preventing installation.
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
const dbPath = path.join(dataDir, 'telemetry.json')

export interface ThreatLog {
  id: string
  timestamp: number
  ip_address: string
  user_agent: string | null
  session_hash: string | null
  server_score: number
  client_score: number
  final_score: number
  tier: 'HUMAN' | 'SUSPICIOUS' | 'BOT'
  server_breakdown: string
  client_breakdown: string
}

function readLogs(): ThreatLog[] {
  if (!fs.existsSync(dbPath)) return []
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'))
  } catch {
    return []
  }
}

function writeLogs(logs: ThreatLog[]) {
  fs.writeFileSync(dbPath, JSON.stringify(logs, null, 2))
}

export function insertThreatLog(log: Omit<ThreatLog, 'id'>) {
  const logs = readLogs()
  logs.push({
    ...log,
    id: `BB-TL-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
  })
  // Keep file size reasonable for the demo natively
  if (logs.length > 500) logs.shift()
  writeLogs(logs)
}

export function getRecentThreatLogs(limit = 50): ThreatLog[] {
  const logs = readLogs()
  return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

export function getBotStats() {
  const logs = readLogs()
  return {
    total: logs.length,
    bots: logs.filter(l => l.tier === 'BOT').length,
    suspicious: logs.filter(l => l.tier === 'SUSPICIOUS').length
  }
}

const db = {}

export default db
