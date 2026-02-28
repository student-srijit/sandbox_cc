'use client'

import { useEffect, useState, useRef } from 'react'

const HEX_CHARS = '0123456789abcdef'

function fakePrivKey() {
    return '0x' + Array.from({ length: 64 }, () =>
        HEX_CHARS[Math.floor(Math.random() * 16)]
    ).join('')
}

function fakeAddr() {
    return '0x' + Array.from({ length: 40 }, () =>
        HEX_CHARS[Math.floor(Math.random() * 16)]
    ).join('')
}

function fakeBal() {
    return (Math.random() * 180 + 12).toFixed(4)
}

const ATTACKER_IPS = [
    '103.28.41.219', '185.220.101.44', '45.148.10.92',
    '91.132.147.55', '176.111.174.31',
]

interface FakeData {
    id: number
    type: 'PRIVATE_KEY' | 'ETH_BALANCE' | 'CONTRACT_ADDR'
    value: string
    ip: string
    timestamp: string
}

let fakeId = 0

function makeFake(): FakeData {
    const types: FakeData['type'][] = ['PRIVATE_KEY', 'ETH_BALANCE', 'CONTRACT_ADDR']
    const type = types[Math.floor(Math.random() * types.length)]
    let value = ''
    switch (type) {
        case 'PRIVATE_KEY': value = fakePrivKey(); break
        case 'ETH_BALANCE': value = `${fakeBal()} ETH`; break
        case 'CONTRACT_ADDR': value = fakeAddr(); break
    }
    return {
        id: ++fakeId,
        type,
        value,
        ip: ATTACKER_IPS[Math.floor(Math.random() * ATTACKER_IPS.length)],
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    }
}

export default function IntelFeed() {
    const [items, setItems] = useState<FakeData[]>([])

    const knownLiveIds = useRef(new Set<string>())

    useEffect(() => {
        async function pollIntel() {
            try {
                const res = await fetch('/api/threats')
                if (!res.ok) return
                const data = await res.json()

                const newLogs = (data.logs || []).filter((l: any) => l.network?.tier === 'BOT' && !knownLiveIds.current.has(l.threat_id))

                if (newLogs.length > 0) {
                    const mapped = newLogs.map((l: any) => {
                        knownLiveIds.current.add(l.threat_id)
                        const payloads = l.payloads || []
                        const method = payloads.length > 0 ? payloads[0].method : 'ETH_BALANCE'
                        const valueStr = payloads.length > 0 ? JSON.stringify(payloads[0].params || {}) : fakePrivKey()

                        let type: FakeData['type'] = 'CONTRACT_ADDR'
                        if (method.includes('Transaction') || method.includes('send') || method.includes('sign')) type = 'PRIVATE_KEY'
                        else if (method.includes('call') || method.includes('Balance')) type = 'ETH_BALANCE'

                        return {
                            id: ++fakeId,
                            type,
                            value: valueStr.substring(0, 50) + (valueStr.length > 50 ? '...' : ''),
                            ip: l.network?.entry_ip || 'UNKNOWN',
                            timestamp: new Date(l.timeline?.last_active || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
                        }
                    })
                    setItems(prev => [...mapped, ...prev].slice(0, 15))
                }
            } catch (err) { }
        }

        pollIntel()
        const id = setInterval(pollIntel, 1000)
        return () => clearInterval(id)
    }, [])

    const typeColor = (t: FakeData['type']) => {
        switch (t) {
            case 'PRIVATE_KEY': return '#FF2020'
            case 'ETH_BALANCE': return '#FFB800'
            case 'CONTRACT_ADDR': return '#00FF41'
        }
    }

    const typeLabel = (t: FakeData['type']) => {
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
                    All data is AI-generated bait · Ollama LLM Active
                </p>
            </div>
        </div>
    )
}
