'use client'

import { useEffect, useRef } from 'react'

const HEX_R = 38

interface Hex {
    x: number
    y: number
    phase: number
    vx: number
    vy: number
    dangerFlash: number // countdown in frames
    baseBrightness: number
    hoverBrightness: number
}

export default function HexGridCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mouseRef = useRef({ x: -999, y: -999 })

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')!

        let W = 0, H = 0
        let hexes: Hex[] = []
        let hexT = 0
        let animId: number

        // Center of viewport (where the orbital system is)
        const getCenter = () => ({ cx: W * 0.43, cy: H * 0.5 })

        function buildHexes() {
            hexes = []
            const w = HEX_R * 2
            const h = Math.sqrt(3) * HEX_R
            for (let row = -2; row < Math.ceil(H / h) + 2; row++) {
                for (let col = -1; col < Math.ceil(W / w) + 1; col++) {
                    const x = col * w * 0.75 + (row % 2 === 0 ? 0 : w * 0.375)
                    const y = row * h
                    hexes.push({
                        x, y,
                        phase: Math.random() * Math.PI * 2,
                        vx: (Math.random() - 0.5) * 0.15,
                        vy: (Math.random() - 0.5) * 0.15,
                        dangerFlash: 0,
                        baseBrightness: 0.035 + Math.random() * 0.02,
                        hoverBrightness: 0,
                    })
                }
            }
        }

        function hexPath(x: number, y: number, r: number) {
            ctx.beginPath()
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 180) * (60 * i - 30)
                const px = x + r * Math.cos(a)
                const py = y + r * Math.sin(a)
                if (i === 0) {
                    ctx.moveTo(px, py)
                } else {
                    ctx.lineTo(px, py)
                }
            }
            ctx.closePath()
        }

        function draw() {
            ctx.clearRect(0, 0, W, H)
            hexT += 0.004
            const { cx, cy } = getCenter()
            const repelRadius = 180
            const mx = mouseRef.current.x
            const my = mouseRef.current.y

            hexes.forEach((hex) => {
                // --- DRIFT TOWARD CENTER + REPEL ---
                const dx = cx - hex.x
                const dy = cy - hex.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                // Gentle pull toward center
                if (dist > 50) {
                    hex.vx += (dx / dist) * 0.003
                    hex.vy += (dy / dist) * 0.003
                }

                // Repel when within shield radius
                if (dist < repelRadius && dist > 10) {
                    const repelForce = (repelRadius - dist) / repelRadius * 0.08
                    hex.vx -= (dx / dist) * repelForce
                    hex.vy -= (dy / dist) * repelForce
                }

                // Damping
                hex.vx *= 0.995
                hex.vy *= 0.995

                // Apply velocity
                hex.x += hex.vx
                hex.y += hex.vy

                // Wrap around screen edges
                if (hex.x < -HEX_R * 2) hex.x = W + HEX_R
                if (hex.x > W + HEX_R * 2) hex.x = -HEX_R
                if (hex.y < -HEX_R * 2) hex.y = H + HEX_R
                if (hex.y > H + HEX_R * 2) hex.y = -HEX_R

                // --- RANDOM DANGER FLASH ---
                if (hex.dangerFlash > 0) {
                    hex.dangerFlash--
                } else if (Math.random() < 0.0003) { // ~once per 3000 frames per hex
                    hex.dangerFlash = 18 // ~300ms at 60fps
                }

                // --- CURSOR PROXIMITY BRIGHTENING ---
                const mdx = mx - hex.x
                const mdy = my - hex.y
                const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
                const proximityTarget = mdist < 120 ? Math.max(0, 1 - mdist / 120) * 0.3 : 0
                hex.hoverBrightness += (proximityTarget - hex.hoverBrightness) * 0.1

                // --- DRAW ---
                const pulse = hex.baseBrightness + 0.03 * Math.sin(hexT + hex.phase)
                const brightness = pulse + hex.hoverBrightness

                if (hex.dangerFlash > 0) {
                    // DANGER flash — orange
                    const flashAlpha = 0.15 + 0.15 * Math.sin(hex.dangerFlash * 0.5)
                    ctx.strokeStyle = `rgba(255, 77, 0, ${flashAlpha})`
                    ctx.lineWidth = 2
                    hexPath(hex.x, hex.y, HEX_R)
                    ctx.stroke()
                } else {
                    // Normal grid
                    ctx.strokeStyle = `rgba(61, 0, 184, ${brightness})`
                    ctx.lineWidth = 1
                    hexPath(hex.x, hex.y, HEX_R)
                    ctx.stroke()

                    // Cursor-proximate scale-up glow
                    if (hex.hoverBrightness > 0.02) {
                        ctx.strokeStyle = `rgba(0, 255, 209, ${hex.hoverBrightness * 1.5})`
                        ctx.lineWidth = 1.5
                        hexPath(hex.x, hex.y, HEX_R * (1 + hex.hoverBrightness * 0.1))
                        ctx.stroke()
                    }

                    // Occasional cyan sparkle
                    if (Math.sin(hexT * 0.45 + hex.phase * 2) > 0.96) {
                        ctx.strokeStyle = `rgba(0, 255, 209, ${brightness * 3})`
                        ctx.lineWidth = 1.5
                        hexPath(hex.x, hex.y, HEX_R)
                        ctx.stroke()
                    }

                    // Occasional violet sparkle
                    if (Math.sin(hexT * 0.3 + hex.phase * 3 + 1.5) > 0.98) {
                        ctx.strokeStyle = `rgba(123, 47, 255, ${brightness * 2.5})`
                        ctx.lineWidth = 1.2
                        hexPath(hex.x, hex.y, HEX_R)
                        ctx.stroke()
                    }
                }
            })

            animId = requestAnimationFrame(draw)
        }

        function resize() {
            const el = canvasRef.current
            if (!el) return
            W = el.width = window.innerWidth
            H = el.height = window.innerHeight
            buildHexes()
        }

        const onMouse = (e: MouseEvent) => {
            mouseRef.current.x = e.clientX
            mouseRef.current.y = e.clientY
        }

        resize()
        draw()
        window.addEventListener('resize', resize)
        window.addEventListener('mousemove', onMouse)

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', resize)
            window.removeEventListener('mousemove', onMouse)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className="hex-canvas"
            aria-hidden="true"
        />
    )
}
