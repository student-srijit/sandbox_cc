'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'

// Simplified world map SVG path (continents outline)
const WORLD_PATH = `M 145,65 L 150,55 158,52 165,55 170,50 178,48 185,52 192,48 200,50 210,46 218,48 225,44 235,46 245,48 255,44 262,46 268,42 275,45 280,42 288,44 295,40 302,42 308,38 315,40 320,42 328,38 335,40 338,42 L 338,48 335,55 340,58 345,55 350,58 348,65 L 345,70 338,72 335,78 340,82 345,85 342,92 338,88 335,92 330,88 325,92 320,88 L 315,85 310,88 305,85 300,88 295,92 L 290,95 285,92 280,95 275,92 270,88 265,92 260,95 L 255,92 250,95 245,98 240,95 235,92 230,95 225,98 L 220,102 215,98 210,102 205,98 200,102 195,105 L 190,102 185,105 180,108 175,105 170,102 165,98 L 160,95 155,92 150,88 148,82 145,78 142,72 Z M 355,58 L 360,52 368,48 375,50 382,46 390,48 398,44 405,46 412,48 420,50 428,52 435,55 440,52 445,55 450,58 455,62 458,68 L 460,75 458,82 455,88 450,92 445,95 440,98 435,102 430,98 425,95 420,92 415,95 410,98 405,95 400,92 395,88 390,85 385,82 380,78 375,82 370,78 365,75 360,72 355,68 Z M 115,95 L 120,90 128,88 135,92 138,98 135,105 130,108 125,112 120,115 115,112 110,108 108,102 110,98 Z M 350,110 L 355,105 362,102 370,105 378,108 385,112 392,115 398,118 405,122 410,125 408,132 405,138 400,142 395,145 390,148 385,152 380,155 375,158 370,155 365,152 360,148 355,145 350,142 345,138 342,132 345,125 348,118 Z M 260,130 L 268,125 275,128 282,125 290,128 298,132 305,135 310,138 315,142 320,145 318,152 315,158 310,162 305,165 300,168 295,172 290,168 285,165 280,162 275,158 270,155 265,152 262,145 260,138 Z M 420,155 L 428,150 435,148 442,150 448,155 455,158 460,162 458,168 455,175 450,178 445,182 440,178 435,175 430,172 425,168 422,162 Z`

interface AttackPulse {
    id: number
    x: number
    y: number
    intensity: number // 1-5
    age: number
}

// Geographic coordinates -> SVG position (simplified Mercator)
const ATTACK_ORIGINS: Array<{ name: string; x: number; y: number }> = [
    { name: 'Moscow', x: 348, y: 52 },
    { name: 'Beijing', x: 425, y: 62 },
    { name: 'Lagos', x: 270, y: 128 },
    { name: 'Pyongyang', x: 435, y: 58 },
    { name: 'Tehran', x: 358, y: 72 },
    { name: 'São Paulo', x: 195, y: 152 },
    { name: 'Mumbai', x: 382, y: 92 },
    { name: 'Shanghai', x: 430, y: 68 },
    { name: 'Kiev', x: 325, y: 48 },
    { name: 'Bucharest', x: 318, y: 55 },
    { name: 'Jakarta', x: 430, y: 130 },
    { name: 'Bogotá', x: 170, y: 118 },
]

// Honeypot session locations (amber)
const HONEYPOT_LOCS = [
    { x: 200, y: 62, label: 'US-EAST' },
    { x: 300, y: 48, label: 'EU-WEST' },
    { x: 408, y: 78, label: 'APAC-1' },
]

// Simple equirectangular projection to map GPS to our 580x200 SVG Viewport
// Adjusting roughly to align with the simplified world path 
function projectLocation(lat: number, lon: number) {
    // 0,0 center roughly maps to our SVG's center x: 290, y: 100
    // Lons go -180 to 180, Lats go -90 to 90

    // Scale longitude linearly
    const x = ((lon + 180) / 360) * 580

    // Scale latitude linearly (inverted because SVG y=0 is top)
    // Shift slightly because map path cuts off Antarctica
    const y = ((90 - lat) / 180) * 160 + 20

    return { x, y }
}

export default function ThreatMap() {
    const [pins, setPins] = useState<{ id: string, x: number, y: number, intensity: number }[]>([])
    const [totalAttacks, setTotalAttacks] = useState(0)
    const [activeNow, setActiveNow] = useState(0)
    const knownPins = useRef<Record<string, { x: number, y: number, intensity: number }>>({})

    const { token } = useAuth()

    // Pull real attacks from backend
    useEffect(() => {
        if (!token) return

        async function pollMapData() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()

                if (data.stats) {
                    setTotalAttacks(data.stats.total)
                    setActiveNow(data.stats.bots + data.stats.suspicious)
                }

                const displayLogs = (data.logs || []).filter((l: any) => l.network?.tier !== 'HUMAN')

                const currentPins: any[] = []

                displayLogs.forEach((l: any) => {
                    const tid = l.threat_id
                    if (knownPins.current[tid]) {
                        currentPins.push({ id: tid, ...knownPins.current[tid] })
                    } else {
                        // New threat downlinked
                        let origin = { x: 348, y: 52 } // Default Moscow
                        let intensity = 1

                        if (l.network?.geo) {
                            const { lat, lon, hosting, proxy } = l.network.geo
                            const mapped = projectLocation(lat, lon)
                            origin = {
                                x: Math.max(0, Math.min(580, mapped.x)),
                                y: Math.max(0, Math.min(200, mapped.y))
                            }
                            intensity = hosting || proxy ? 5 : 2
                        } else {
                            origin = ATTACK_ORIGINS[Math.floor(Math.random() * ATTACK_ORIGINS.length)]
                            intensity = Math.ceil(Math.random() * 5)
                        }

                        // Jitter to separate stacked coordinates
                        const jitterX = (Math.random() - 0.5) * 4
                        const jitterY = (Math.random() - 0.5) * 4

                        const newPin = {
                            x: origin.x + jitterX,
                            y: origin.y + jitterY,
                            intensity
                        }

                        knownPins.current[tid] = newPin
                        currentPins.push({ id: tid, ...newPin })
                    }
                })

                setPins(currentPins)

            } catch (err) { }
        }

        pollMapData()
        const id = setInterval(pollMapData, 1500)
        return () => clearInterval(id)
    }, [token])

    return (
        <div className="h-full flex flex-col">
            {/* Panel header */}
            <div className="wr-panel-header">
                <span className="wr-panel-title">GLOBAL THREAT MAP</span>
                <div className="flex items-center gap-4 text-[9px]">
                    <span className="text-[#FF2020]">
                        <span className="text-[13px] font-bold">{totalAttacks}</span> ATTACKS
                    </span>
                    <span className="text-[#FFB800]">
                        <span className="text-[13px] font-bold">{activeNow}</span> LIVE
                    </span>
                </div>
            </div>

            {/* Map */}
            <div className="flex-1 relative overflow-hidden">
                <svg
                    viewBox="0 0 580 200"
                    preserveAspectRatio="xMidYMid slice"
                    className="w-full h-full"
                    aria-label="Global threat map"
                >
                    {/* Grid lines */}
                    {Array.from({ length: 12 }, (_, i) => (
                        <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="200"
                            stroke="#111" strokeWidth="0.3" />
                    ))}
                    {Array.from({ length: 8 }, (_, i) => (
                        <line key={`h${i}`} x1="0" y1={i * 30} x2="580" y2={i * 30}
                            stroke="#111" strokeWidth="0.3" />
                    ))}

                    {/* World outline */}
                    <path
                        d={WORLD_PATH}
                        fill="none"
                        stroke="#222"
                        strokeWidth="0.8"
                        opacity="0.7"
                    />

                    {/* Honeypot locations (sustained amber glow) */}
                    {HONEYPOT_LOCS.map((hp, i) => (
                        <g key={`hp-${i}`}>
                            <circle cx={hp.x} cy={hp.y} r="8" fill="none"
                                stroke="#FFB800" strokeWidth="0.5" opacity="0.3">
                                <animate attributeName="r" values="6;10;6" dur="3s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={hp.x} cy={hp.y} r="2.5" fill="#FFB800" opacity="0.7">
                                <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite" />
                            </circle>
                            <text x={hp.x} y={hp.y - 12} textAnchor="middle"
                                fill="#FFB800" fontSize="4" fontFamily="inherit" opacity="0.6">
                                {hp.label}
                            </text>
                        </g>
                    ))}

                    {/* Attack pins (crimson continuous expanding rings) */}
                    {pins.map((p) => {
                        const maxR = 6 + p.intensity * 3
                        return (
                            <g key={p.id}>
                                <circle cx={p.x} cy={p.y} r={maxR}
                                    fill="none" stroke="#FF2020"
                                    strokeWidth={0.8} opacity="0.6">
                                    <animate attributeName="r" values={`2;${maxR};2`} dur={`${1.5 + p.intensity * 0.2}s`} repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur={`${1.5 + p.intensity * 0.2}s`} repeatCount="indefinite" />
                                </circle>
                                <circle cx={p.x} cy={p.y} r="1.5" fill="#FF2020" opacity={0.9} />
                            </g>
                        )
                    })}

                    {/* Connection lines from attacks to nearest honeypot */}
                    {pins.slice(-10).map((p) => {
                        const nearest = HONEYPOT_LOCS.reduce<{ x: number; y: number; label: string; d: number }>((best, hp) => {
                            const d = Math.hypot(hp.x - p.x, hp.y - p.y)
                            return d < best.d ? { ...hp, d } : best
                        }, { ...HONEYPOT_LOCS[0], d: Infinity })
                        return (
                            <line key={`line-${p.id}`}
                                x1={p.x} y1={p.y} x2={nearest.x} y2={nearest.y}
                                stroke="#FF2020" strokeWidth="0.3" opacity="0.25"
                                strokeDasharray="2 2" />
                        )
                    })}
                </svg>

                {/* Legend */}
                <div className="absolute bottom-2 left-3 flex items-center gap-4 text-[8px] text-[#444]">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#FF2020]" /> ATTACK ORIGIN
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#FFB800]" /> HONEYPOT NODE
                    </span>
                </div>
            </div>
        </div>
    )
}
