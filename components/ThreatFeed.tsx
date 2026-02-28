'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'

const THREAT_TYPES = [
    { type: 'REENTRANCY', css: 'text-[#FF4D00]', border: '#FF4D00' },
    { type: 'PHISHING', css: 'text-[#FFB800]', border: '#FFB800' },
    { type: 'FLASH LOAN', css: 'text-[#4A9EFF]', border: '#4A9EFF' },
    { type: 'HONEYPOT', css: 'text-[#4A9EFF]', border: '#4A9EFF' },
    { type: 'SANDWICH', css: 'text-[#4A9EFF]', border: '#4A9EFF' },
    { type: 'RUG PULL', css: 'text-[#FF2020]', border: '#FF2020' },
    { type: 'MEV BOT', css: 'text-[#00FFD1]', border: '#00FFD1' },
    { type: 'FRONTRUN', css: 'text-[#7B2FFF]', border: '#7B2FFF' },
] as const

interface ThreatEntry {
    id: number | string
    type: string
    css: string
    border: string
    from: string
    to: string
    time: string
}

let entryId = 0

function rAddr() {
    return '0x' + Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('') + '…'
}

function rTime() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function makeThreat(): ThreatEntry {
    const t = THREAT_TYPES[Math.floor(Math.random() * THREAT_TYPES.length)]
    return {
        id: ++entryId,
        type: t.type,
        css: t.css,
        border: t.border,
        from: rAddr(),
        to: rAddr(),
        time: rTime(),
    }
}

const MAX = 25

export default function ThreatFeed() {
    const [entries, setEntries] = useState<ThreatEntry[]>([])
    const [blocked, setBlocked] = useState(0)
    const [counterPop, setCounterPop] = useState(false)

    const knownLiveIds = useRef(new Set<string>())
    const { token } = useAuth()

    useEffect(() => {
        if (!token) return

        // Strict real-time mode: start empty
        setEntries([])
        setBlocked(0)

        async function pollThreats() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()
                const logs = data.logs.filter((l: any) => l.network?.tier !== 'HUMAN')

                const newLogs = logs.filter((l: any) => !knownLiveIds.current.has(l.threat_id))
                if (newLogs.length === 0) return

                // Logs are newest first, we want the newest at [0] when prepended.
                // So mapped should be in the same order (newest first).
                const formatted = newLogs.map((l: any) => {
                    knownLiveIds.current.add(l.threat_id)
                    const date = new Date(l.timeline?.last_active || Date.now())
                    const tier = l.network?.tier || 'UNKNOWN'
                    const score = l.network?.threat_score || 0
                    const ip = l.network?.entry_ip || 'UNKNOWN'

                    return {
                        id: l.threat_id as string,
                        type: `[${tier}] (SCORE: ${score})`,
                        css: tier === 'BOT' ? 'text-[#FF003C]' : 'text-[#FFD700]',
                        border: tier === 'BOT' ? '#FF003C' : '#FFD700',
                        from: ip,
                        to: 'HONEYPOT.ROUTER',
                        time: date.toLocaleTimeString('en-GB', { hour12: false })
                    }
                })

                setEntries(prev => [...formatted, ...prev].slice(0, MAX))
                setBlocked(prev => prev + formatted.length)

                setCounterPop(true)
                setTimeout(() => setCounterPop(false), 300)
            } catch (err) { }
        }
        const pollId = setInterval(pollThreats, 1500)
        pollThreats()

        return () => {
            clearInterval(pollId)
        }
    }, [token])

    return (
        <aside
            className="threat-feed-panel flex flex-col overflow-hidden"
            aria-label="Live Threat Feed"
        >
            {/* Radar scanline sweep */}
            <div
                className="absolute inset-0 pointer-events-none z-20"
                aria-hidden="true"
            >
                <div className="feed-scanline" />
            </div>

            {/* Header */}
            <div
                className="flex items-center gap-2 px-4 py-3.5 flex-shrink-0 relative z-10"
                style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
                <div className="feed-dot" />
                <span
                    className="text-[8.5px] tracking-[0.25em] uppercase font-semibold"
                    style={{ color: 'var(--text-dim)' }}
                >
                    Live Threat Feed
                </span>
                <span
                    className={`ml-auto text-[9px] font-bold transition-transform duration-200 ${counterPop ? 'scale-[1.3]' : 'scale-100'
                        }`}
                    style={{
                        color: 'var(--danger)',
                        fontFamily: 'var(--font-mono)',
                    }}
                >
                    {blocked} Blocked
                </span>
            </div>

            {/* Feed entries */}
            <div className="flex-1 overflow-hidden relative z-10">
                <div className="flex flex-col">
                    {entries.map((entry, idx) => (
                        <div
                            key={entry.id}
                            className="feed-entry px-3.5 py-2 relative"
                            style={{
                                borderLeft: `3px solid ${entry.border}`,
                                opacity: Math.pow(0.95, idx), // 95% cascade
                            }}
                        >
                            <div className="flex items-center justify-between mb-0.5">
                                <span className={`text-[8px] tracking-[0.1em] uppercase font-bold ${entry.css}`}>
                                    {entry.type}
                                </span>
                                <span
                                    className="text-[6.5px]"
                                    style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
                                >
                                    {entry.time}
                                </span>
                            </div>
                            {/* Address with strikethrough animation */}
                            <div
                                className="text-[7px] truncate mb-0.5 relative feed-addr-strike"
                                style={{ color: 'rgba(180,180,220,0.45)', fontFamily: 'var(--font-mono)' }}
                            >
                                {entry.from} → {entry.to}
                            </div>
                            <div
                                className="text-[6.5px] tracking-[0.1em] uppercase font-semibold"
                                style={{ color: 'var(--cyan)' }}
                            >
                                BLOCKED ✓
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div
                className="px-4 py-2 flex-shrink-0 relative z-10 shimmer"
                style={{ borderTop: '1px solid var(--glass-border)' }}
            >
                <p
                    className="text-[7px] tracking-[0.15em] uppercase text-center"
                    style={{ color: 'var(--text-dim)' }}
                >
                    Shield integrity: <span style={{ color: 'var(--cyan)' }}>100%</span>
                </p>
            </div>
        </aside>
    )
}
