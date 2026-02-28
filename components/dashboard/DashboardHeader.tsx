'use client'

import { useEffect, useState } from 'react'

export default function DashboardHeader() {
    const [time, setTime] = useState('')
    const [uptime, setUptime] = useState(0)

    useEffect(() => {
        const tick = () => {
            setTime(new Date().toLocaleTimeString('en-GB', { hour12: false }))
            setUptime(prev => prev + 1)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    const fmtUptime = `${Math.floor(uptime / 3600).toString().padStart(2, '0')}:${Math.floor((uptime % 3600) / 60).toString().padStart(2, '0')}:${(uptime % 60).toString().padStart(2, '0')}`

    return (
        <header className="h-10 flex items-center px-4 gap-6 border-b border-[#1a1a1a] bg-black flex-shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.25em] text-[#00FF41]">
                    BHOOL BHULAIYAA
                </span>
                <span className="text-[9px] text-[#333] tracking-[0.15em]">
          //
                </span>
                <span className="text-[9px] text-[#555] tracking-[0.15em] uppercase">
                    Threat Intelligence Center
                </span>
            </div>

            {/* Status indicators */}
            <div className="ml-auto flex items-center gap-6 text-[9px]">
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
                    <span className="text-[#00FF41]">HONEYPOT ACTIVE</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-pulse" />
                    <span className="text-[#FFB800]">3 SESSIONS</span>
                </span>
                <span className="text-[#555]">
                    UTC {time}
                </span>
                <span className="text-[#333]">
                    UPTIME {fmtUptime}
                </span>
            </div>
        </header>
    )
}
