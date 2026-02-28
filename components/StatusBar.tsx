'use client'

import { useEffect, useRef, useState } from 'react'

const START_NODES = 14_820
const START_THREATS = 2_341
const START_BLOCK = 21_847_301

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

    // Nodes: +1-3 every 8-12 seconds
    useEffect(() => {
        const tick = () => {
            setNodes(prev => prev + Math.floor(Math.random() * 3 + 1))
            timerId = setTimeout(tick, (8 + Math.random() * 4) * 1000)
        }
        let timerId = setTimeout(tick, 8000 + Math.random() * 4000)
        return () => clearTimeout(timerId)
    }, [])

    // Threats: +1 every 15-25 seconds
    useEffect(() => {
        const tick = () => {
            setThreats(prev => prev + 1)
            timerId = setTimeout(tick, (15 + Math.random() * 10) * 1000)
        }
        let timerId = setTimeout(tick, 15000 + Math.random() * 10000)
        return () => clearTimeout(timerId)
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
                            {s.value.toLocaleString()}
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
                        {block.toLocaleString()}
                    </span>
                </span>
            </div>
        </footer>
    )
}
