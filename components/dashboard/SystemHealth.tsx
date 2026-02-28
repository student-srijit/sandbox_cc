'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

/* ── Tiny sparkline component ─────────────────────────── */
function Sparkline({ data, color, width = 100, height = 24 }: {
    data: number[]
    color: string
    width?: number
    height?: number
}) {
    if (data.length < 2) return <div style={{ width, height }} />

    const min = Math.min(...data)
    const max = Math.max(...data) || 1
    const range = max - min || 1
    const stepX = width / (data.length - 1)

    const points = data.map((v, i) =>
        `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`
    ).join(' ')

    // Area fill
    const area = `0,${height} ${points} ${width},${height}`

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
            <polygon points={area} fill={`${color}11`} />
            <polyline points={points} fill="none" stroke={color} strokeWidth="1" />
            {/* Current value dot */}
            <circle
                cx={(data.length - 1) * stepX}
                cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
                r="2"
                fill={color}
            >
                <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite" />
            </circle>
        </svg>
    )
}

/* ── Metric ───────────────────────────────────────────── */
interface MetricConfig {
    label: string
    unit: string
    color: string
    baseValue: number
    jitter: number
}

const METRICS: MetricConfig[] = [
    { label: 'OLLAMA LLM', unit: 'ms', color: '#00FF41', baseValue: 45, jitter: 15 },
    { label: 'API LATENCY', unit: 'ms', color: '#FFB800', baseValue: 12, jitter: 8 },
    { label: 'SHIELD MUT/s', unit: '/s', color: '#00FF41', baseValue: 247, jitter: 30 },
    { label: 'DB WRITE RATE', unit: 'ops/s', color: '#00FF41', baseValue: 1842, jitter: 200 },
    { label: 'MEM USAGE', unit: 'MB', color: '#FFB800', baseValue: 512, jitter: 40 },
    { label: 'CPU', unit: '%', color: '#00FF41', baseValue: 23, jitter: 12 },
]

const HISTORY_LEN = 30

export default function SystemHealth() {
    const [histories, setHistories] = useState<number[][]>(
        METRICS.map(m => [m.baseValue])
    )

    useEffect(() => {
        const id = setInterval(() => {
            setHistories(prev => prev.map((hist, i) => {
                const m = METRICS[i]
                const last = hist[hist.length - 1]
                const next = Math.max(0, last + (Math.random() - 0.5) * m.jitter * 2)
                return [...hist.slice(-HISTORY_LEN), next]
            }))
        }, 1200)
        return () => clearInterval(id)
    }, [])

    return (
        <div className="h-12 flex items-center border-t border-[#1a1a1a] bg-black px-4 gap-0 flex-shrink-0">
            {METRICS.map((m, i) => {
                const current = histories[i][histories[i].length - 1]
                const isWarning = m.label === 'API LATENCY' && current > 18
                const displayColor = isWarning ? '#FF2020' : m.color

                return (
                    <div
                        key={m.label}
                        className="flex items-center gap-2 px-3 h-full"
                        style={{
                            borderRight: i < METRICS.length - 1
                                ? '1px solid #111'
                                : 'none'
                        }}
                    >
                        <Sparkline data={histories[i]} color={displayColor} width={80} height={20} />
                        <div className="flex flex-col">
                            <span className="text-[6px] text-[#333] tracking-[0.15em] uppercase whitespace-nowrap leading-none">
                                {m.label}
                            </span>
                            <span
                                className="text-[13px] font-bold tabular-nums leading-none mt-0.5"
                                style={{ color: displayColor }}
                            >
                                {Math.round(current)}
                                <span className="text-[7px] text-[#333] ml-0.5">{m.unit}</span>
                            </span>
                        </div>
                    </div>
                )
            })}

            {/* System status */}
            <div className="ml-auto flex items-center gap-2 pl-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
                <span className="text-[8px] text-[#333] tracking-widest uppercase">
                    ALL SYSTEMS NOMINAL
                </span>
            </div>
        </div>
    )
}
