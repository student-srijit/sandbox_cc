'use client'

import { useRef, useEffect } from 'react'
import MazeSVG from './MazeSVG'
import ConnectWallet from './ConnectWallet'

export default function HeroSection() {
    const sectionRef = useRef<HTMLDivElement>(null)
    const mazeRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        const section = sectionRef.current
        if (!section) return

        const onMove = (e: MouseEvent) => {
            const el = mazeRef.current
            if (!el) return
            const cx = window.innerWidth / 2
            const cy = window.innerHeight / 2
            const dx = (e.clientX - cx) / cx
            const dy = (e.clientY - cy) / cy
            el.style.transform = `rotateX(${22 - dy * 9}deg) rotateY(${dx * 9}deg) rotateZ(${dx * 1.5}deg)`
        }

        window.addEventListener('mousemove', onMove)
        return () => window.removeEventListener('mousemove', onMove)
    }, [])

    return (
        <section
            ref={sectionRef}
            className="relative flex items-center justify-center overflow-hidden"
        >
            {/* Corner decorators */}
            <div className="corner-decorator corner-tl absolute top-3 left-3" />
            <div className="corner-decorator corner-tr absolute top-3 right-3" />
            <div className="corner-decorator corner-bl absolute bottom-3 left-3" />
            <div className="corner-decorator corner-br absolute bottom-3 right-3" />

            {/* 3D Maze background */}
            <div className="maze-perspective-wrap">
                <MazeSVG ref={mazeRef} />
            </div>

            {/* Connect Wallet — sits above maze at center */}
            <ConnectWallet />
        </section>
    )
}
