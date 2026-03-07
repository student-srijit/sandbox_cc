'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Ripple {
    id: number
    x: number
    y: number
    size: number
}

export default function CustomCursor() {
    const dotRef = useRef<HTMLDivElement>(null)
    const [hovering, setHovering] = useState(false)
    const [ripples, setRipples] = useState<Ripple[]>([])
    const rippleId = useRef(0)

    const spawnRipple = useCallback((x: number, y: number, size = 100) => {
        const id = ++rippleId.current
        setRipples(prev => [...prev, { id, x, y, size }])
        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== id))
        }, 900)
    }, [])

    // Start the dot off-screen so it's hidden until the first mousemove
    useEffect(() => {
        if (dotRef.current) {
            dotRef.current.style.left = '-20px'
            dotRef.current.style.top = '-20px'
        }
    }, [])

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (dotRef.current) {
                dotRef.current.style.left = e.clientX + 'px'
                dotRef.current.style.top = e.clientY + 'px'
            }
        }

        const onClick = (e: MouseEvent) => {
            spawnRipple(e.clientX, e.clientY, 130)
        }

        // Hover detection for interactive elements
        const onOver = (e: MouseEvent) => {
            const t = e.target as Element
            if (t.closest('button, a, [data-hover]')) setHovering(true)
        }
        const onOut = (e: MouseEvent) => {
            const t = e.target as Element
            if (t.closest('button, a, [data-hover]')) setHovering(false)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('click', onClick)
        document.addEventListener('mouseover', onOver)
        document.addEventListener('mouseout', onOut)

        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('click', onClick)
            document.removeEventListener('mouseover', onOver)
            document.removeEventListener('mouseout', onOut)
        }
    }, [spawnRipple])

    return (
        <>
            {/* Sharp cursor dot */}
            <div
                ref={dotRef}
                className={`cursor-dot${hovering ? ' hovering' : ''}`}
                aria-hidden="true"
            />
            {/* Click ripples */}
            {ripples.map(r => (
                <div
                    key={r.id}
                    className="ripple"
                    style={{
                        left: r.x - r.size / 2,
                        top: r.y - r.size / 2,
                        width: r.size,
                        height: r.size,
                    }}
                    aria-hidden="true"
                />
            ))}
        </>
    )
}
