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
            className="relative flex items-center justify-center overflow-hidden w-full h-full"
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
                <div className="flex items-center gap-3">
                    <Link
                        href="/vault"
                        className="px-6 py-3 text-[11px] tracking-[0.35em] uppercase font-bold border-2 border-[#00FF41] text-[#00FF41] bg-[#00FF41]/10 hover:bg-[#00FF41]/25 hover:text-black transition-all shadow-[0_0_20px_rgba(0,255,65,0.3)]"
                    >
                        Launch Vault
                    </Link>
                    <Link
                        href="/ledger"
                        className="px-6 py-3 text-[11px] tracking-[0.35em] uppercase font-bold border-2 border-[#00FFD1] text-[#00FFD1] bg-[#00FFD1]/10 hover:bg-[#00FFD1]/25 transition-all shadow-[0_0_20px_rgba(0,255,209,0.3)]"
                    >
                        Immutable Ledger
                    </Link>
                </div>
            </div>
        </section>
    )
}
