'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const LOGO_TEXT = 'BHOOL BHULAIYAA'

function HexLetterCell({ char, index }: { char: string; index: number }) {
    const [lit, setLit] = useState(false)

    // Boot unlock: staggered left-to-right, 60ms delay per cell
    useEffect(() => {
        const timer = setTimeout(() => setLit(true), 400 + index * 60)
        return () => clearTimeout(timer)
    }, [index])

    if (char === ' ') return <div className="w-3" aria-hidden="true" />

    return (
        <div
            className={`hex-letter-cell group transition-all duration-300 ${lit ? 'opacity-100' : 'opacity-0 scale-75'
                }`}
            data-hover="true"
            style={{
                transform: lit ? 'rotate(0deg) scale(1)' : 'rotate(-60deg) scale(0.8)',
                transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            }}
        >
            <svg viewBox="0 0 30 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <polygon
                    points="15,1 29,7.5 29,20.5 15,27 1,20.5 1,7.5"
                    style={{
                        fill: 'none',
                        stroke: lit ? 'url(#grad-stroke)' : 'rgba(61,0,184,0.15)',
                        strokeWidth: 1.5,
                        transition: 'stroke 0.3s, stroke-width 0.3s, filter 0.3s',
                    }}
                />
            </svg>
            <span
                className="relative z-10 text-[9px] font-bold tracking-tight leading-none transition-colors duration-300 group-hover:text-white"
                style={{ color: lit ? 'var(--cyan)' : 'rgba(61,0,184,0.3)' }}
            >
                {char}
            </span>
        </div>
    )
}

export default function LogoHex() {
    return (
        <Link href="/" className="flex items-center gap-0.5 no-underline">
            <div className="flex items-center gap-0.5">
                {LOGO_TEXT.split('').map((char, i) => (
                    <HexLetterCell key={i} char={char} index={i} />
                ))}
            </div>
            <span
                className="ml-3 self-end mb-1 text-[7px] tracking-[0.22em] uppercase font-light"
                style={{ color: 'var(--text-dim)' }}
            >
                Web3 Security Shield
            </span>
        </Link>
    )
}
