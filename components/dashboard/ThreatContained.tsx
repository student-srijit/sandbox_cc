'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════
   THREAT CONTAINED — "Kill Confirmed" Overlay
   A dramatic full-screen drawer that appears when a new
   attacker is successfully trapped in the honeypot.
═══════════════════════════════════════════════════════════ */

// Fake attacker dossier data
const ATTACKER_DATA = {
    ip: '185.220.101.44',
    city: 'Moscow',
    country: 'Russia',
    flag: '🇷🇺',
    vector: 'RPC ENDPOINT PROBING → WALLET DRAINER SCRIPT INJECTION',
    entryTime: new Date(Date.now() - 47 * 60 * 1000), // 47 min ago
    sessId: 'BB-2026-0220-7A3F',
    confidence: 98.7,
}

const REDACTED_LINES = [
    'SIGINT INTERCEPT REF: ████████████-4A9',
    'LINKED WALLETS: 0x████████…3f2d, 0x████████…91ab',
    'PRIOR INCIDENTS: ██ (CLASSIFIED)',
    'HANDLER NOTES: Subject exhibits ████████ pattern',
]

/* ── 3D Maze Corridor (SVG) ──────────────────────────── */
function MazeCorridor({ phase }: { phase: number }) {
    // phase: 0→1 over ~4 seconds
    // The red dot walks forward, then walls close

    const dotProgress = Math.min(phase * 1.6, 1)   // dot reaches end at phase=0.625
    const wallClose = Math.max(0, (phase - 0.6) * 2.5) // walls start closing at phase=0.6

    // Perspective corridor: vanishing point at center
    const cx = 300, cy = 120
    const wallOpacity = 0.15 + wallClose * 0.4

    // Corridor walls receding
    const layers = 8
    const rects = Array.from({ length: layers }, (_, i) => {
        const t = i / layers
        const s = 1 - t * 0.82 // scale shrinks toward vanishing
        const w = 280 * s
        const h = 180 * s
        const x = cx - w / 2
        const y = cy - h / 2
        const alpha = 0.08 + t * 0.04
        return { x, y, w, h, alpha, t }
    })

    // Red dot position (walks toward vanishing point)
    const dotX = cx
    const dotStartY = cy + 70
    const dotEndY = cy - 5
    const dotY = dotStartY + (dotEndY - dotStartY) * dotProgress
    const dotR = 6 - dotProgress * 4 // shrinks as it walks "into" the corridor
    const dotGlow = dotProgress < 0.9 ? 1 : 1 - (dotProgress - 0.9) * 10

    // Closing wall (gate descending)
    const gateY = cy - 60 + wallClose * 90 // drops from top
    const gateOpacity = wallClose * 0.8

    return (
        <svg viewBox="0 0 600 240" className="w-full" style={{ maxHeight: '220px' }}>
            <defs>
                <radialGradient id="dot-glow-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FF2020" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FF2020" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Floor grid */}
            {Array.from({ length: 20 }, (_, i) => {
                const y = cy + 10 + i * 8
                const spread = (i / 20) * 260
                return (
                    <line key={`fg-${i}`}
                        x1={cx - spread} y1={y} x2={cx + spread} y2={y}
                        stroke="#FF2020" strokeWidth="0.3" opacity={0.06 + (i / 20) * 0.08}
                    />
                )
            })}
            {Array.from({ length: 12 }, (_, i) => {
                const angle = ((i - 6) / 12) * 1.2
                return (
                    <line key={`fv-${i}`}
                        x1={cx} y1={cy} x2={cx + Math.sin(angle) * 300} y2={cy + 100}
                        stroke="#FF2020" strokeWidth="0.3" opacity="0.05"
                    />
                )
            })}

            {/* Corridor walls (receding rectangles) */}
            {rects.map((r, i) => (
                <rect key={i}
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill="none"
                    stroke="#FF2020"
                    strokeWidth={0.5 + (1 - r.t) * 0.5}
                    opacity={r.alpha + wallClose * 0.15}
                    rx="1"
                />
            ))}

            {/* Side wall lines converging */}
            <line x1={cx - 140} y1={cy + 90} x2={cx - 10} y2={cy - 60}
                stroke="#FF2020" strokeWidth="0.6" opacity={wallOpacity} />
            <line x1={cx + 140} y1={cy + 90} x2={cx + 10} y2={cy - 60}
                stroke="#FF2020" strokeWidth="0.6" opacity={wallOpacity} />
            <line x1={cx - 100} y1={cy + 90} x2={cx - 5} y2={cy - 45}
                stroke="#FF2020" strokeWidth="0.4" opacity={wallOpacity * 0.6} />
            <line x1={cx + 100} y1={cy + 90} x2={cx + 5} y2={cy - 45}
                stroke="#FF2020" strokeWidth="0.4" opacity={wallOpacity * 0.6} />

            {/* Closing gate  */}
            {wallClose > 0 && (
                <g>
                    <rect
                        x={cx - 30} y={cy - 70}
                        width={60} height={gateY - (cy - 70)}
                        fill="#FF2020"
                        opacity={gateOpacity * 0.15}
                    />
                    <line x1={cx - 30} y1={gateY} x2={cx + 30} y2={gateY}
                        stroke="#FF2020" strokeWidth="2" opacity={gateOpacity}
                    />
                    {/* Gate teeth */}
                    {Array.from({ length: 5 }, (_, i) => (
                        <line key={`gt-${i}`}
                            x1={cx - 24 + i * 12} y1={gateY}
                            x2={cx - 24 + i * 12} y2={gateY + 6}
                            stroke="#FF2020" strokeWidth="1.5" opacity={gateOpacity * 0.7}
                        />
                    ))}
                </g>
            )}

            {/* The red dot (attacker) */}
            <circle cx={dotX} cy={dotY} r={dotR + 8}
                fill="url(#dot-glow-grad)" opacity={dotGlow * 0.5} />
            <circle cx={dotX} cy={dotY} r={dotR}
                fill="#FF2020" opacity={dotGlow}>
                {dotProgress < 0.9 && (
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="0.6s" repeatCount="indefinite" />
                )}
            </circle>

            {/* "Dead end" text appears after walls close */}
            {wallClose > 0.7 && (
                <text x={cx} y={cy + 110} textAnchor="middle"
                    fill="#FF2020" fontSize="6" fontFamily="inherit"
                    letterSpacing="0.3em" opacity={(wallClose - 0.7) * 3.3}>
                    NO EXIT
                </text>
            )}
        </svg>
    )
}

/* ── Main Overlay ──────────────────────────────────────── */
interface ThreatContainedProps {
    open: boolean
    onClose: () => void
}

export default function ThreatContained({ open, onClose }: ThreatContainedProps) {
    const [phase, setPhase] = useState(0)
    const [timeWasted, setTimeWasted] = useState(0)
    const [revealed, setRevealed] = useState(false)
    const startRef = useRef(Date.now())

    // Animate corridor phase 0→1
    useEffect(() => {
        if (!open) { setPhase(0); setRevealed(false); return }
        startRef.current = Date.now()
        const id = setInterval(() => {
            const elapsed = (Date.now() - startRef.current) / 1000
            const p = Math.min(elapsed / 4, 1)
            setPhase(p)
            if (p >= 1 && !revealed) setRevealed(true)
        }, 50)
        return () => clearInterval(id)
    }, [open, revealed])

    // Time wasted counter (ticks up in real-time)
    useEffect(() => {
        if (!open) { setTimeWasted(0); return }
        // Start from the "entry time" difference
        const baseSeconds = Math.floor((Date.now() - ATTACKER_DATA.entryTime.getTime()) / 1000)
        setTimeWasted(baseSeconds)
        const id = setInterval(() => setTimeWasted(prev => prev + 1), 1000)
        return () => clearInterval(id)
    }, [open])

    const fmtTime = (s: number) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    const entryTimeStr = ATTACKER_DATA.entryTime.toLocaleTimeString('en-GB', { hour12: false })

    if (!open) return null

    return (
        <>
            {/* Backdrop — dims dashboard to 30% */}
            <div
                className="tc-backdrop"
                onClick={onClose}
                aria-label="Close overlay"
            />

            {/* Drawer panel — slides from right */}
            <div className="tc-drawer">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-5 text-[#333] hover:text-[#FF2020] text-[11px] tracking-widest transition-colors z-50"
                >
                    ✕ CLOSE
                </button>

                {/* Sound design note */}
                <div className="absolute top-4 left-5 text-[7px] text-[#1a1a1a] tracking-widest uppercase">
                    🔊 AUDIO: low-frequency vault-lock sound plays here
                </div>

                {/* ── Maze Corridor Animation ──────────────────── */}
                <div className="px-8 pt-10 pb-2">
                    <MazeCorridor phase={phase} />
                </div>

                {/* ── THREAT CONTAINED Title ───────────────────── */}
                <div className="text-center px-8 mb-1">
                    <h1 className="tc-title">
                        THREAT CONTAINED
                    </h1>
                    <p className="text-[8px] text-[#FF2020] tracking-[0.5em] uppercase opacity-60 mt-1">
                        HONEYPOT SESSION {ATTACKER_DATA.sessId}
                    </p>
                </div>

                {/* ── Dossier Card ─────────────────────────────── */}
                <div className="tc-dossier mx-8 mt-4">
                    {/* Dossier header */}
                    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <span className="text-[7px] text-[#FF2020] tracking-[0.3em] uppercase font-bold">
                            ▌ CLASSIFIED — ATTACKER DOSSIER
                        </span>
                        <span className="text-[7px] text-[#222] tracking-wider">
                            CONFIDENCE: <span className="text-[#FF2020] font-bold">{ATTACKER_DATA.confidence}%</span>
                        </span>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[9px]">
                        <div>
                            <span className="tc-field-label">IP ADDRESS</span>
                            <span className="tc-field-value">{ATTACKER_DATA.ip}</span>
                        </div>
                        <div>
                            <span className="tc-field-label">GEOGRAPHIC ORIGIN</span>
                            <span className="tc-field-value">
                                {ATTACKER_DATA.flag} {ATTACKER_DATA.city}, {ATTACKER_DATA.country}
                            </span>
                        </div>
                        <div className="col-span-2">
                            <span className="tc-field-label">ATTACK VECTOR</span>
                            <span className="tc-field-value text-[#FFB800]">{ATTACKER_DATA.vector}</span>
                        </div>
                        <div>
                            <span className="tc-field-label">TIME OF ENTRY</span>
                            <span className="tc-field-value">{entryTimeStr} UTC</span>
                        </div>
                        <div>
                            <span className="tc-field-label">ESTIMATED TIME WASTED</span>
                            <span className="tc-time-wasted">{fmtTime(timeWasted)}</span>
                        </div>
                    </div>

                    {/* Redaction bars */}
                    <div className="mt-4 pt-3" style={{ borderTop: '1px solid #111' }}>
                        <span className="text-[6px] text-[#1a1a1a] tracking-[0.3em] uppercase block mb-2">
                            SUPPLEMENTARY INTELLIGENCE
                        </span>
                        {REDACTED_LINES.map((line, i) => (
                            <p
                                key={i}
                                className="text-[8px] text-[#181818] leading-relaxed"
                                style={{
                                    opacity: revealed ? 1 : 0,
                                    transition: `opacity 0.5s ${0.3 + i * 0.15}s`,
                                }}
                            >
                                {line}
                            </p>
                        ))}
                    </div>
                </div>

                {/* ── Action Buttons ───────────────────────────── */}
                <div className="flex gap-3 px-8 mt-5 mb-6">
                    <button className="tc-btn tc-btn-primary flex-1">
                        <span className="text-[9px]">↓</span> EXPORT THREAT REPORT
                    </button>
                    <button className="tc-btn tc-btn-secondary flex-1">
                        <span className="text-[9px]">◉</span> VIEW HONEYPOT FEED
                    </button>
                </div>

                {/* ── Footer note ──────────────────────────────── */}
                <div className="px-8 pb-4 text-center">
                    <p className="text-[6.5px] text-[#151515] tracking-[0.2em] uppercase leading-relaxed">
                        This subject is currently being fed AI-generated bait data.<br />
                        They believe they have accessed a real wallet with 147.8 ETH.
                    </p>
                </div>
            </div>
        </>
    )
}
