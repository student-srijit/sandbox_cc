'use client'

import { useEffect, useRef, useState } from 'react'
import LogoHex from './LogoHex'
import ShieldStatus from './ShieldStatus'

export default function Topbar() {
    return (
        <header className="topbar-glass w-full h-full flex items-center justify-between px-7 relative z-10">
            {/* Left: Logo */}
            <LogoHex />

            {/* Center: decorative line */}
            <div className="flex-1 mx-8 h-px opacity-20"
                style={{ background: 'linear-gradient(90deg, transparent, #3D00B8, #00FFD1, #3D00B8, transparent)' }}
            />

            {/* Right: Shield Status */}
            <ShieldStatus />
        </header>
    )
}
