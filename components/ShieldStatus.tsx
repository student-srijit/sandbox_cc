'use client'

import { useEffect, useRef, useState } from 'react'

function randomHex(len: number) {
    return '0x' + Array.from({ length: len }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('').toUpperCase()
}

const HEX_CHARS = '0123456789ABCDEF'

/**
 * Character-scramble effect: each character rapidly randomizes
 * through hex chars before settling on the final value.
 */
function useScrambleHash(length: number, interval: number) {
    // Deterministic initial value to prevent SSR ↔ Client hydration mismatch
    const [display, setDisplay] = useState(() => '0x' + '0'.repeat(length))
    const targetRef = useRef('')
    const scrambleRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        const cycleHash = () => {
            const newTarget = randomHex(length)
            targetRef.current = newTarget
            const totalChars = newTarget.length // includes "0x"
            let iteration = 0
            const maxIterations = 14 // scramble cycles before settling

            if (scrambleRef.current) clearInterval(scrambleRef.current)

            scrambleRef.current = setInterval(() => {
                iteration++
                const settled = Math.floor((iteration / maxIterations) * (totalChars - 2)) // chars settled so far (excluding 0x)

                const result = newTarget.split('').map((finalChar, i) => {
                    if (i < 2) return finalChar // "0x" prefix
                    if (i - 2 < settled) return finalChar // already settled
                    return HEX_CHARS[Math.floor(Math.random() * 16)] // scrambling
                }).join('')

                setDisplay(result)

                if (iteration >= maxIterations) {
                    if (scrambleRef.current) clearInterval(scrambleRef.current)
                    setDisplay(newTarget)
                }
            }, 35)
        }

        cycleHash()
        const mainInterval = setInterval(cycleHash, interval)

        return () => {
            clearInterval(mainInterval)
            if (scrambleRef.current) clearInterval(scrambleRef.current)
        }
    }, [length, interval])

    return display
}

export default function ShieldStatus() {
    const hash = useScrambleHash(18, 4000)
    const [state, setState] = useState<'INITIALIZING' | 'ACTIVE' | 'AUTHENTICATING'>('INITIALIZING')
    const [threatTier, setThreatTier] = useState<'PENDING' | 'HUMAN' | 'SUSPICIOUS' | 'BOT'>('PENDING')

    // Boot sequence: start as INITIALIZING, switch to ACTIVE after 1.5s
    useEffect(() => {
        const bootTimer = setTimeout(() => setState('ACTIVE'), 1500)
        return () => clearTimeout(bootTimer)
    }, [])

    // Listen for wallet-connect event
    useEffect(() => {
        const handler = () => {
            setState('AUTHENTICATING')
            setTimeout(() => setState('ACTIVE'), 2800)
        }
        window.addEventListener('wallet-connect', handler)
        return () => window.removeEventListener('wallet-connect', handler)
    }, [])

    // Listen for telemetry completion
    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent
            if (customEvent.detail && customEvent.detail.tier) {
                setThreatTier(customEvent.detail.tier)
            }
        }
        window.addEventListener('bb-telemetry-ready', handler)
        return () => window.removeEventListener('bb-telemetry-ready', handler)
    }, [])

    const stateLabel = state === 'INITIALIZING'
        ? '◆ INITIALIZING…'
        : state === 'AUTHENTICATING'
            ? '▶ AUTHENTICATING…'
            : '● ACTIVE'

    const tierColor = threatTier === 'PENDING' ? '#666'
        : threatTier === 'HUMAN' ? '#00FF41'
            : threatTier === 'SUSPICIOUS' ? '#FFD700'
                : '#FF003C'

    return (
        <div className="flex items-center gap-4">
            {/* Text info */}
            <div className="text-right">
                <p
                    className="text-[8px] tracking-[0.2em] uppercase font-semibold mb-0.5"
                    style={{ color: 'var(--cyan)' }}
                >
                    Polymorphic Shield
                </p>
                <p className={`text-[10px] font-bold tracking-[0.1em] shield-state-text ${state === 'AUTHENTICATING' ? 'authenticating' : ''
                    }`}>
                    {stateLabel}
                </p>
                {/* Scrambling hash display */}
                <div className="flex items-center justify-end gap-2 mt-0.5">
                    <span
                        className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]"
                        style={{ backgroundColor: tierColor, color: tierColor }}
                        title={`Threat Classification: ${threatTier}`}
                    />
                    <p
                        className="text-[7.5px] tracking-[0.06em] hash-scramble"
                        style={{
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.08em',
                        }}
                    >
                        {hash.slice(0, 20)}
                    </p>
                </div>
            </div>

            {/* Ring */}
            <div className="relative w-[52px] h-[52px] flex-shrink-0">
                <svg
                    viewBox="0 0 52 52"
                    fill="none"
                    className="shield-ring-svg w-full h-full"
                >
                    <circle cx="26" cy="26" r="22" stroke="rgba(61,0,184,0.3)" strokeWidth="2" />
                    <circle
                        cx="26" cy="26" r="22"
                        stroke="url(#shield-grad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray="100 38"
                    />
                    <circle
                        cx="26" cy="26" r="16"
                        stroke="rgba(0,255,209,0.15)"
                        strokeWidth="0.5"
                        strokeDasharray="2 4"
                    />
                    <circle
                        cx="26" cy="26" r="9"
                        stroke="rgba(123,47,255,0.2)"
                        strokeWidth="0.5"
                        strokeDasharray="1 3"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[18px]">
                    🛡
                </div>
            </div>
        </div>
    )
}
