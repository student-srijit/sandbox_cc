'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import SessionReplay from '@/components/dashboard/SessionReplay'

interface Session {
    id: string | number
    time: string
    ip: string
    type: string
    status: 'FEEDING' | 'TRACED' | 'ACTIVE'
    severity: 'high' | 'medium' | 'low'
}

interface ThreatApiLog {
    threat_id: string
    network?: {
        tier?: string
        threat_score?: number
        entry_ip?: string
    }
    classification?: {
        attack_type?: string
    }
    timeline?: {
        last_active?: number | string
    }
}

const MAX = 35

export default function HoneypotSessions() {
    const [sessions, setSessions] = useState<Session[]>([])
    const { token } = useAuth()
    const [replayId, setReplayId] = useState<string | null>(null)

    useEffect(() => {
        if (!token) return

        async function pollSessions() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()
                const logs = Array.isArray(data?.logs) ? (data.logs as ThreatApiLog[]) : []

                const validLogs = logs.filter((log) => log.network?.tier !== 'HUMAN')

                const sessionMap = validLogs.map((log) => {
                    const statusRoll = log.network?.threat_score || 0
                    const status: Session['status'] = statusRoll > 95 ? 'ACTIVE' : statusRoll > 80 ? 'TRACED' : 'FEEDING'
                    const severity: Session['severity'] = statusRoll > 90 ? 'high' : 'medium'
                    const date = new Date(log.timeline?.last_active || Date.now())
                    return {
                        id: log.threat_id,
                        time: date.toLocaleTimeString('en-GB', { hour12: false }),
                        ip: log.network?.entry_ip || '—',
                        type: log.classification?.attack_type
                            ? log.classification.attack_type
                            : log.network?.tier === 'BOT' ? 'BOT_PROBE' : 'SUSPICIOUS_TRAFFIC',
                        status,
                        severity,
                    }
                })
                setSessions(sessionMap.slice(0, MAX))
            } catch { }
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
        <>
        <div className="h-full flex flex-col">
            <div className="wr-panel-header">
                <span className="wr-panel-title">LIVE HONEYPOT SESSIONS</span>
                <span className="text-[9px] text-[#00FF41]">{sessions.length} ENTRIES</span>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {/* Scanline */}
                <div className="wr-scanline" />

                <div className="flex flex-col">
                   {sessions.map((s) => (
                        <div
                            key={s.id}
                            className="wr-session-row group cursor-pointer"
                            style={{
                                borderLeftColor: s.severity === 'high' ? '#FF2020' : s.severity === 'medium' ? '#FFB800' : 'transparent',
                            }}
                            title={String(s.id).startsWith('TR-') ? 'Click to replay attack sequence' : ''}
                            onClick={() => {
                                const sid = String(s.id)
                                if (sid.startsWith('TR-')) setReplayId(sid)
                            }}
                        >
                            <span className="text-[#aaaaaa] w-[60px] flex-shrink-0">{s.time}</span>
                            <span className="text-[#e0e0e0] w-[105px] flex-shrink-0 truncate font-mono">{s.ip}</span>
                            <span className="text-white flex-1 truncate font-bold tracking-wide">{s.type}</span>
                            <span
                                className="text-right flex-shrink-0 font-bold text-[11px]"
                                style={{ color: statusColor(s.status) }}
                            >
                                {statusText(s.status)}
                            </span>
                            {/* Arrow — was text-[8px], now text-lg and always faintly visible */}
                            <span className={`ml-3 flex-shrink-0 transition-all duration-150 text-lg leading-none ${
                                String(s.id).startsWith('TR-')
                                    ? 'text-[#00FFD1]/50 group-hover:text-[#00FFD1] group-hover:scale-125'
                                    : 'text-[#ffffff]/10'
                            }`}>
                                ▶
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {replayId && (
            <SessionReplay
                threatId={replayId}
                onClose={() => setReplayId(null)}
            />
        )}
        </>
    )
}
