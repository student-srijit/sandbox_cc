'use client'

import Link from 'next/link'
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
            <div className="flex flex-col items-center gap-6 z-10">
                <ConnectWallet />
                <Link
                    href="/dashboard"
                    className="group relative px-8 py-3 text-[11px] tracking-[0.35em] uppercase font-bold border-2 border-[#FF2020] text-[#FF2020] bg-[#FF2020]/10 hover:bg-[#FF2020]/25 hover:text-white transition-all shadow-[0_0_20px_rgba(255,32,32,0.3)] hover:shadow-[0_0_35px_rgba(255,32,32,0.55)] animate-pulse"
                    style={{ animationDuration: '2.5s' }}
                >
                    Go to DASHBOARD
                </Link>
            </div>
        </section>
    )
}
