'use client'

import { useEffect, useRef, useState } from 'react'

interface IntelData {
    id: number
    type: 'PRIVATE_KEY' | 'ETH_BALANCE' | 'CONTRACT_ADDR'
    value: string
    ip: string
    timestamp: string
}

let intelId = 0

interface ThreatPayload {
    method?: string
    params?: unknown
}

interface ThreatApiLog {
    threat_id: string
    network?: {
        tier?: string
        entry_ip?: string
    }
    payloads?: ThreatPayload[]
    timeline?: {
        last_active?: number | string
    }
}

export default function IntelFeed() {
    const [items, setItems] = useState<IntelData[]>([])

    const knownLiveIds = useRef(new Set<string>())

    useEffect(() => {
        async function pollIntel() {
            try {
                const res = await fetch('/api/threats')
                if (!res.ok) return
                const data = await res.json()
                const logs = Array.isArray(data?.logs) ? (data.logs as ThreatApiLog[]) : []

                const newLogs = logs.filter((log) => log.network?.tier === 'BOT' && !knownLiveIds.current.has(log.threat_id))

                if (newLogs.length > 0) {
                    const mapped = newLogs.map((log) => {
                        knownLiveIds.current.add(log.threat_id)
                        const payloads = log.payloads || []
                        const method = payloads.length > 0 ? payloads[0].method : 'ETH_BALANCE'
                        const valueStr = payloads.length > 0
                            ? JSON.stringify(payloads[0].params || {})
                            : '<no-payload-captured>'

                        let type: IntelData['type'] = 'CONTRACT_ADDR'
                        if (method?.includes('Transaction') || method?.includes('send') || method?.includes('sign')) type = 'PRIVATE_KEY'
                        else if (method?.includes('call') || method?.includes('Balance')) type = 'ETH_BALANCE'

                        return {
                            id: ++intelId,
                            type,
                            value: valueStr.substring(0, 50) + (valueStr.length > 50 ? '...' : ''),
                            ip: log.network?.entry_ip || 'UNKNOWN',
                            timestamp: new Date(log.timeline?.last_active || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
                        }
                    })
                    setItems(prev => [...mapped, ...prev].slice(0, 15))
                }
            } catch { }
        }

        pollIntel()
        const id = setInterval(pollIntel, 1000)
        return () => clearInterval(id)
    }, [])

    const typeColor = (t: IntelData['type']) => {
        switch (t) {
            case 'PRIVATE_KEY': return '#FF2020'
            case 'ETH_BALANCE': return '#FFB800'
            case 'CONTRACT_ADDR': return '#00FF41'
        }
    }

    const typeLabel = (t: IntelData['type']) => {
        switch (t) {
            case 'PRIVATE_KEY': return '🔑 PRIV KEY'
            case 'ETH_BALANCE': return '💰 BALANCE'
            case 'CONTRACT_ADDR': return '📄 CONTRACT'
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="wr-panel-header">
                <span className="wr-panel-title">HONEYPOT INTELLIGENCE</span>
                <span className="text-[8px] text-[#FF2020] animate-pulse">● LIVE</span>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="flex flex-col">
                    {items.map((item, idx) => (
                        <div
                            key={item.id}
                            className="px-3 py-2 border-b border-[#111]"
                            style={{
                                opacity: Math.pow(0.92, idx),
                                animation: idx === 0 ? 'slide-in-entry 0.3s ease-out' : 'none',
                            }}
                        >
                            {/* IP header */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[7px] text-[#333]">{item.timestamp}</span>
                                <span className="text-[7px] text-[#FFB800]">
                                    SERVING TO → {item.ip}
                                </span>
                            </div>

                            {/* Type badge */}
                            <div className="flex items-center gap-2">
                                <span
                                    className="text-[7px] font-bold tracking-wider"
                                    style={{ color: typeColor(item.type) }}
                                >
                                    {typeLabel(item.type)}
                                </span>
                            </div>

                            {/* Fake value */}
                            <div className="mt-0.5 text-[8px] text-[#444] truncate select-all" style={{ wordBreak: 'break-all' }}>
                                {item.value}
                            </div>

                            {/* Dark humor label */}
                            {item.type === 'PRIVATE_KEY' && (
                                <div className="text-[6px] text-[#331111] mt-0.5 italic">
                                    ATTACKER THINKS THIS IS REAL
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="px-3 py-1.5 border-t border-[#111] flex-shrink-0">
                <p className="text-[7px] text-[#222] text-center tracking-widest uppercase">
                    Live threat telemetry feed
                </p>
            </div>
        </div>
    )
}
