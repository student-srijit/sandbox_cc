'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import SessionReplay from '@/components/dashboard/SessionReplay'

interface Session {
    id: string | number
    time: string
    ip: string
    type: string
    status: 'OBSERVED' | 'CONTAINED' | 'ACTIVE'
    severity: 'high' | 'medium' | 'low'
    description: string
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
        trigger_reason?: string
        inferred_toolchain?: string
    }
    timeline?: {
        last_active?: number | string
    }
}

interface ThreatApiContainment {
    ip: string
    mode: string
    threat_id: string | null
}

interface ThreatApiResponse {
    logs?: ThreatApiLog[]
    containment?: {
        containments?: ThreatApiContainment[]
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
                const data = (await res.json()) as ThreatApiResponse
                const logs = Array.isArray(data?.logs) ? (data.logs as ThreatApiLog[]) : []
                const containments = Array.isArray(data?.containment?.containments)
                    ? data.containment.containments
                    : []
                const containedThreatIds = new Set(
                    containments.map(c => c.threat_id).filter((v): v is string => Boolean(v)),
                )
                const containedIps = new Set(containments.map(c => c.ip))

                const validLogs = logs.filter((log) => log.network?.tier !== 'HUMAN')

                const sessionMap = validLogs.map((log) => {
                    const score = log.network?.threat_score || 0
                    const ip = log.network?.entry_ip || '—'
                    const isContained = containedThreatIds.has(log.threat_id) || containedIps.has(ip)
                    const status: Session['status'] = isContained
                        ? 'CONTAINED'
                        : log.network?.tier === 'BOT'
                        ? 'ACTIVE'
                        : 'OBSERVED'
                    const severity: Session['severity'] = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low'
                    const date = new Date(log.timeline?.last_active || Date.now())
                    return {
                        id: log.threat_id,
                        time: date.toLocaleTimeString('en-GB', { hour12: false }),
                        ip,
                        type: log.classification?.attack_type
                            ? log.classification.attack_type
                            : log.network?.tier === 'BOT' ? 'UNKNOWN_BOT_ACTIVITY' : 'UNKNOWN_ACTIVITY',
                        status,
                        severity,
                        description:
                            log.classification?.trigger_reason ||
                            `Tier=${log.network?.tier || 'UNKNOWN'} Score=${score}`,
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
            case 'OBSERVED': return '#FFB800'
            case 'CONTAINED': return '#00FF41'
            case 'ACTIVE': return '#FF2020'
        }
    }

    const statusText = (s: Session['status']) => {
        switch (s) {
            case 'OBSERVED': return 'OBSERVED'
            case 'CONTAINED': return 'CONTAINED ✓'
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
            <div className="px-3 py-1.5 border-t border-[#15231d] text-[8px] text-[#6f807a] truncate">
                {sessions.length > 0 ? sessions[0].description : 'No live threat descriptions yet'}
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
