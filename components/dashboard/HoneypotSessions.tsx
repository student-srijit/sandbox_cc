'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'

const ATTACK_TYPES = [
    'SQL_INJECTION', 'RPC_PROBING', 'WALLET_DRAIN', 'PATH_TRAVERSAL',
    'XSS_PROBE', 'BRUTE_FORCE', 'ABI_DECODE', 'MEMPOOL_SNIFF',
] as const

const IPS = [
    '103.28.41.', '185.220.101.', '45.148.10.', '91.132.147.',
    '176.111.174.', '194.26.192.', '5.188.86.', '212.193.30.',
    '103.75.201.', '45.155.205.', '185.156.73.', '91.241.19.',
]

interface Session {
    id: number
    time: string
    ip: string
    type: string
    status: 'FEEDING' | 'TRACED' | 'ACTIVE'
    severity: 'high' | 'medium' | 'low'
}

let sid = 0

function makeSession(): Session {
    const type = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)]
    const ip = IPS[Math.floor(Math.random() * IPS.length)] + Math.floor(Math.random() * 254 + 1)
    const statusRoll = Math.random()
    const status: Session['status'] = statusRoll < 0.4 ? 'FEEDING' : statusRoll < 0.7 ? 'TRACED' : 'ACTIVE'
    const severity: Session['severity'] = statusRoll < 0.3 ? 'high' : statusRoll < 0.7 ? 'medium' : 'low'
    return {
        id: ++sid,
        time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        ip,
        type,
        status,
        severity,
    }
}

const MAX = 35

export default function HoneypotSessions() {
    const [sessions, setSessions] = useState<Session[]>([])
    const containerRef = useRef<HTMLDivElement>(null)
    const { token } = useAuth()

    useEffect(() => {
        if (!token) return

        async function pollSessions() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()

                const validLogs = (data.logs || []).filter((l: any) => l.network?.tier !== 'HUMAN')

                const sessionMap = validLogs.map((l: any) => {
                    const statusRoll = l.network?.threat_score || 0
                    const status: Session['status'] = statusRoll > 95 ? 'ACTIVE' : statusRoll > 80 ? 'TRACED' : 'FEEDING'
                    const severity: Session['severity'] = statusRoll > 90 ? 'high' : 'medium'
                    const date = new Date(l.timeline?.last_active || Date.now())
                    return {
                        id: l.threat_id,
                        time: date.toLocaleTimeString('en-GB', { hour12: false }),
                        ip: l.network?.entry_ip || 'UNKNOWN',
                        type: l.classification?.attack_type || 'UNKNOWN',
                        status,
                        severity,
                    }
                })
                setSessions(sessionMap.slice(0, MAX))
            } catch (err) { }
        }

        pollSessions()
        const id = setInterval(pollSessions, 1500)
        return () => clearInterval(id)
    }, [token])

    const statusColor = (s: Session['status']) => {
        switch (s) {
            case 'FEEDING': return '#FFB800'
            case 'TRACED': return '#00FF41'
            case 'ACTIVE': return '#FF2020'
        }
    }

    const statusText = (s: Session['status']) => {
        switch (s) {
            case 'FEEDING': return 'FEEDING FAKE DATA'
            case 'TRACED': return 'TRACED ✓'
            case 'ACTIVE': return 'ACTIVE SESSION'
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="wr-panel-header">
                <span className="wr-panel-title">LIVE HONEYPOT SESSIONS</span>
                <span className="text-[9px] text-[#00FF41]">{sessions.length} ENTRIES</span>
            </div>

            <div ref={containerRef} className="flex-1 overflow-hidden relative">
                {/* Scanline */}
                <div className="wr-scanline" />

                <div className="flex flex-col">
                    {sessions.map((s, idx) => (
                        <div
                            key={s.id}
                            className="wr-session-row"
                            style={{
                                borderLeftColor: s.severity === 'high' ? '#FF2020' : 'transparent',
                                opacity: Math.pow(0.97, idx),
                            }}
                        >
                            <span className="text-[#333] w-[60px] flex-shrink-0">{s.time}</span>
                            <span className="text-[#555] w-[105px] flex-shrink-0 truncate">{s.ip}</span>
                            <span className="text-[#666] flex-1 truncate">{s.type}</span>
                            <span
                                className="text-right flex-shrink-0 font-bold"
                                style={{ color: statusColor(s.status) }}
                            >
                                {statusText(s.status)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
