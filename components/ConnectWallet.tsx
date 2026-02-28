'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePolyClass } from '@/components/poly/PolyProvider'

const HEX_CHARS = '0123456789ABCDEF'
const N_PARTICLES = 20
const SESSION_CHARS = '4F3A91C02B7E8D56'.split('')

function randomHex(len: number) {
    return '0x' + Array.from({ length: len }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('').toUpperCase()
}

interface Particle {
    angle: number
    char: string
    isCyan: boolean
    ring: number // 0=inner, 1=mid, 2=outer
}

export default function ConnectWallet() {
    const orbitRef = useRef<HTMLDivElement>(null)
    const animRef = useRef<number>()
    const angleRef = useRef(0)
    const [session, setSession] = useState('0x4F3A9B')
    const [glitching, setGlitching] = useState(false)
    const [hovered, setHovered] = useState(false)
    const [booted, setBooted] = useState(false)
    const targetRadiusRef = useRef(1) // 0-1 for tractor beam

    // Polymorphic Hook: gets session-mutated class name
    const polyConnectClass = usePolyClass('connect-wallet-btn')

    // Particles across 3 rings
    const particles = useRef<Particle[]>(
        Array.from({ length: N_PARTICLES }, (_, i) => ({
            angle: (360 / N_PARTICLES) * i + (Math.random() * 10),
            char: SESSION_CHARS[i % SESSION_CHARS.length],
            isCyan: i % 3 !== 0,
            ring: i % 3, // distribute across 3 rings
        }))
    )

    // Boot: expand from zero
    useEffect(() => {
        const timer = setTimeout(() => setBooted(true), 1500)
        return () => clearTimeout(timer)
    }, [])

    // Session scramble cycle
    useEffect(() => {
        const interval = setInterval(() => setSession(randomHex(6)), 4000)
        return () => clearInterval(interval)
    }, [])

    // Glitch reshape every 6 seconds
    useEffect(() => {
        const doGlitch = () => {
            setGlitching(true)
            // Scramble session during glitch
            let iter = 0
            const scrambleId = setInterval(() => {
                iter++
                setSession('0x' + Array.from({ length: 4 }, () =>
                    HEX_CHARS[Math.floor(Math.random() * 16)]
                ).join(''))
                if (iter > 8) {
                    clearInterval(scrambleId)
                    setSession(randomHex(6))
                    setGlitching(false)
                }
            }, 40)
        }

        const glitchInterval = setInterval(doGlitch, 6000)
        return () => clearInterval(glitchInterval)
    }, [])

    // Hover tractor beam
    useEffect(() => {
        const animate = () => {
            const target = hovered ? 0.6 : 1.0
            targetRadiusRef.current += (target - targetRadiusRef.current) * 0.06
            animRef.current = requestAnimationFrame(animate)
        }
        animRef.current = requestAnimationFrame(animate)
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
    }, [hovered])

    // Orbit animation
    useEffect(() => {
        const container = orbitRef.current
        if (!container) return
        let localAnimId: number

        const RING_RADII = [60, 85, 115] // inner, mid, outer
        const RING_SPEEDS = [0.6, -0.4, 0.22] // fast CW, med CCW, slow CW
        const RING_DASH = ['4 6', '6 8', '8 12']

        const els = Array.from(container.querySelectorAll('.orbit-particle')) as HTMLDivElement[]
        const W = 240, H = 240
        const cx = W / 2, cy = H / 2

        function animate() {
            angleRef.current += 1

            const radiusMult = targetRadiusRef.current
            const bootMult = !document.querySelector('.booted') ? 0 : 1

            els.forEach((el, i) => {
                const p = particles.current[i]
                const speed = RING_SPEEDS[p.ring]
                const baseR = RING_RADII[p.ring]
                const a = ((p.angle + angleRef.current * speed) * Math.PI) / 180
                const wobble = Math.sin((angleRef.current * 0.03) + i * 0.7) * 6
                const r = (baseR + wobble) * radiusMult
                const x = cx + r * Math.cos(a) - 7
                const y = cy + r * Math.sin(a) - 7

                el.style.left = x + 'px'
                el.style.top = y + 'px'

                // Pulsing glow every 2s
                const pulse = Math.sin(angleRef.current * 0.05 + i * 0.8)
                el.style.opacity = String(0.4 + 0.6 * Math.max(0, pulse))

                const glowIntensity = Math.max(0, pulse) * 10
                el.style.textShadow = p.isCyan
                    ? `0 0 ${glowIntensity}px #00FFD1`
                    : `0 0 ${glowIntensity}px #7B2FFF`
            })

            localAnimId = requestAnimationFrame(animate)
        }

        localAnimId = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(localAnimId)
    }, [])

    const handleClick = async () => {
        // 1. Check Threat Tier from Cookie
        const cookies = document.cookie.split('; ')
        const threatCookie = cookies.find(row => row.startsWith('bb-threat-score='))

        let shouldChallenge = false
        if (threatCookie) {
            try {
                const threatData = JSON.parse(decodeURIComponent(threatCookie.split('=')[1]))
                if (threatData.tier === 'SUSPICIOUS' && !threatData.verifiedPow) {
                    shouldChallenge = true
                }
            } catch (e) {
                // Parse error, proceed carefully
            }
        }

        // 2. Perform Proof of Work if Suspicious
        if (shouldChallenge) {
            setGlitching(true)
            console.log('[Security] Suspicious behavioral footprint detected. Initiating Proof of Work challenge...')

            try {
                // Fetch challenge params
                const chalRes = await fetch('/api/pow-challenge')
                const { challenge, difficulty } = await chalRes.json()

                // Spawn background worker
                const worker = new Worker('/pow-worker.js')
                await new Promise((resolve, reject) => {
                    worker.postMessage({ challenge, difficulty })
                    worker.onmessage = async (e) => {
                        if (e.data.nonce !== undefined) {
                            // Verify with server
                            const verifyRes = await fetch('/api/pow-verify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ challenge, nonce: e.data.nonce, difficulty })
                            })
                            if (verifyRes.ok) resolve(true)
                            else reject('PoW Invalid')
                        } else {
                            reject('PoW Failed')
                        }
                    }
                    worker.onerror = () => reject('Worker Error')
                })

                console.log('[Security] Proof of Work successful. Connecting wallet...')
            } catch (err) {
                console.error('[Security] Challenge failed. Connection terminated.', err)
                setGlitching(false)
                return // Halt flow
            }
        }

        // 3. Normal Flow 
        setGlitching(true)

        console.log('[Connecting] Injecting simulated tx into proxy...')
        // We simulate a Web3 dApp automatically trying to read state 
        // upon connection, routing it to our Python Backend.
        fetch('/api/rpc', {
            method: 'POST',
            headers: {
                'X-Force-Bot': 'true', // Force the backend honeypot trap for manual demo clicks
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_sendRawTransaction",
                params: ["0xf86b018..."], // simulated drainer payload
                id: 1
            })
        }).catch(() => { }) // We don't care about the result for the connect button

        setTimeout(() => {
            window.dispatchEvent(new Event('wallet-connect'))
            setSession(randomHex(6))
            setGlitching(false)

            // For Demo Purposes: 
            // We wait a few seconds and then forcefully trigger the backend 
            // SQLite session garbage collector so the manual click pops up on the screen
            // without requiring 10+ random polling events.
            setTimeout(() => {
                fetch('http://localhost:8000/api/flush', { method: 'POST' }).catch(() => { })
            }, 1000)

        }, 600)
    }

    // Ring SVGs (3 concentric dashed rings)
    const ringConfigs = [
        { r: 60, dash: '4 6', speed: 'animate-[spin-slow_5s_linear_infinite]', color: 'rgba(0,255,209,0.25)', width: 1 },
        { r: 85, dash: '6 8', speed: 'animate-[spin-reverse_7s_linear_infinite]', color: 'rgba(123,47,255,0.2)', width: 0.8 },
        { r: 115, dash: '8 12', speed: 'animate-[spin-slow_12s_linear_infinite]', color: 'rgba(0,255,209,0.15)', width: 0.6 },
    ]

    return (
        <div
            className={`wallet-wrap z-10 transition-all duration-1000 ${booted ? 'booted opacity-100 scale-100' : 'opacity-0 scale-50'}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Dashed orbit ring SVGs */}
            <svg
                className="absolute pointer-events-none"
                style={{ width: 240, height: 240, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                viewBox="0 0 240 240"
                aria-hidden="true"
            >
                {ringConfigs.map((cfg, i) => (
                    <circle
                        key={i}
                        cx="120" cy="120" r={cfg.r}
                        fill="none"
                        stroke={cfg.color}
                        strokeWidth={cfg.width}
                        strokeDasharray={cfg.dash}
                        className={cfg.speed}
                        style={{ transformOrigin: '120px 120px' }}
                    />
                ))}
            </svg>

            {/* Particle orbit container */}
            <div
                ref={orbitRef}
                className="orbit-container absolute"
                style={{ width: 240, height: 240 }}
                aria-hidden="true"
            >
                {particles.current.map((p, i) => (
                    <div
                        key={i}
                        className="orbit-particle absolute will-change-transform"
                        style={{
                            color: p.isCyan ? '#00FFD1' : '#7B2FFF',
                            boxShadow: `0 0 6px ${p.isCyan ? 'rgba(0,255,209,0.4)' : 'rgba(123,47,255,0.4)'}`,
                            background: 'none',
                        }}
                    >
                        {p.char}
                    </div>
                ))}
            </div>

            {/* Main hex button (Polymorphic) */}
            <button
                id="connect-btn"
                className={`${polyConnectClass} ${glitching ? 'glitch-active' : ''}`}
                onClick={handleClick}
                aria-label="Connect Wallet"
            >
                <div className="hex-glow" aria-hidden="true" />
                <div className="hex-border" aria-hidden="true" />
                <div className="hex-clip" aria-hidden="true" />

                <span className={`btn-label ${glitching ? 'glitch-text' : ''}`}>
                    Connect<br />Wallet
                </span>
                <span className="btn-sublabel" aria-live="polite">
                    {session.slice(0, 8)}
                </span>
            </button>
        </div>
    )
}
