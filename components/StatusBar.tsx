'use client'

import { useEffect, useRef, useState } from 'react'

const START_NODES = 0
const START_THREATS = 0
const START_BLOCK = 21_847_301
const NUMBER_FORMATTER = new Intl.NumberFormat('en-US')

type LedgerEntry = {
    timestamp?: string
    auto_blocked?: boolean
    status_label?: string
}

type LedgerResponse = {
    ledger?: LedgerEntry[]
}

function countDeflectedToday(entries: LedgerEntry[]): number {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    return entries.reduce((count, entry) => {
        const blocked = entry.auto_blocked === true || entry.status_label === 'AUTO_BLOCKED'
        if (!blocked) return count

        const ts = Date.parse(entry.timestamp || '')
        if (Number.isNaN(ts)) return count

        return ts >= startOfDay.getTime() && ts <= now.getTime() ? count + 1 : count
    }, 0)
}

/* ── Animated Counter (simple tween) ─────────────────── */
function useAnimatedValue(target: number) {
    const [display, setDisplay] = useState(target)
    const prevTarget = useRef(target)

    useEffect(() => {
        if (target === prevTarget.current) return
        const start = prevTarget.current
        const diff = target - start
        const steps = 12
        let i = 0
        const id = setInterval(() => {
            i++
            setDisplay(Math.round(start + diff * (i / steps)))
            if (i >= steps) {
                clearInterval(id)
                setDisplay(target)
                prevTarget.current = target
            }
        }, 30)
        return () => clearInterval(id)
    }, [target])

    return display
}

/* ── Main StatusBar ──────────────────────────────────── */
export default function StatusBar() {
    const [nodes, setNodes] = useState(START_NODES)
    const [threats, setThreats] = useState(START_THREATS)
    const [domMuts, setDomMuts] = useState(0)
    const [block, setBlock] = useState(START_BLOCK)

    const displayNodes = useAnimatedValue(nodes)
    const displayThreats = useAnimatedValue(threats)
    const displayDomMuts = useAnimatedValue(domMuts)

    // Nodes: Poll real protected node state from API
    useEffect(() => {
        const fetchNodes = async () => {
            try {
                const res = await fetch('/api/protect')
                if (res.ok) {
                    const data = await res.json()
                    setNodes(data.count)
                }
            } catch { }
        }

        fetchNodes()
        const timerId = setInterval(fetchNodes, 2500)
        return () => clearInterval(timerId)
    }, [])

    // Threats: real "deflected today" count from the public ledger endpoint.
    useEffect(() => {
        const fetchThreats = async () => {
            try {
                const res = await fetch('/api/ledger', { cache: 'no-store' })
                if (!res.ok) return
                const data = (await res.json()) as LedgerResponse
                const entries = Array.isArray(data.ledger) ? data.ledger : []
                setThreats(countDeflectedToday(entries))
            } catch { }
        }

        fetchThreats()
        const timerId = setInterval(fetchThreats, 5000)
        return () => clearInterval(timerId)
    }, [])

    // DOM Mutations: +1 every 4 seconds
    useEffect(() => {
        const id = setInterval(() => setDomMuts(prev => prev + 1), 4000)
        return () => clearInterval(id)
    }, [])

    // Block: +1 every 12 seconds
    useEffect(() => {
        const id = setInterval(() => setBlock(prev => prev + 1), 12000)
        return () => clearInterval(id)
    }, [])

    const stats = [
        { icon: '🌐', label: 'Nodes Protected', value: displayNodes },
        { icon: '⚡', label: 'Threats Deflected Today', value: displayThreats },
        { icon: '🔄', label: 'DOM Mutations', value: displayDomMuts },
    ]

    return (
        <footer className="statusbar-glass statusbar-sweep w-full h-full flex items-center px-7">
            {stats.map((s, i) => (
                <div
                    key={s.label}
                    className="flex items-center gap-3 pr-7 mr-7"
                    style={{
                        borderRight: i < stats.length - 1
                            ? '1px solid rgba(61,0,184,0.25)'
                            : 'none'
                    }}
                >
                    <span className="text-[14px]">{s.icon}</span>
                    <div className="flex flex-col justify-center">
                        <span
                            className="text-[7px] tracking-[0.18em] uppercase whitespace-nowrap leading-none"
                            style={{ color: 'var(--text-dim)' }}
                        >
                            {s.label}
                        </span>
                        <span
                            className="stat-value-gradient font-bold text-[16px] leading-none mt-0.5 tabular-nums"
                            style={{ fontFamily: 'var(--font-mono)' }}
                        >
                            {NUMBER_FORMATTER.format(s.value)}
                        </span>
                    </div>
                </div>
            ))}

            {/* Network badge */}
            <div
                className="ml-auto flex items-center gap-2 text-[7.5px]"
                style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
            >
                <div className="net-dot" />
                <span>
                    ETH MAINNET · BLOCK{' '}
                    <span style={{ color: 'var(--cyan)' }}>
                        {NUMBER_FORMATTER.format(block)}
                    </span>
                </span>
            </div>
        </footer>
    )
}
