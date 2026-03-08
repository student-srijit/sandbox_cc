'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'

export default function DashboardHeader() {
    const [time, setTime] = useState('')
    const [uptime, setUptime] = useState(0)
    const { logout, sessionExpiresAt } = useAuth()

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

    // Compute remaining session time live — uptime tick keeps this fresh every second
    const remaining = sessionExpiresAt ? Math.max(0, sessionExpiresAt - Date.now()) : null
    const remainingMins = remaining !== null ? Math.floor(remaining / 60000) : null
    const remainingSecs = remaining !== null ? Math.floor((remaining % 60000) / 1000) : null
    const fmtRemaining = remainingMins !== null
        ? `${remainingMins.toString().padStart(2, '0')}:${remainingSecs!.toString().padStart(2, '0')}`
        : null
    const isExpiringSoon = remaining !== null && remaining < 5 * 60 * 1000 // < 5 min

    return (
        <header className="h-10 flex items-center px-4 gap-6 border-b border-[#1a1a1a] bg-black flex-shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.25em] text-[#00FF41]">
                    BHOOL BHULAIYAA
                </span>
                <span className="text-[9px] text-[#555] tracking-[0.15em]">
                      {'//'}
                </span>
                <span className="text-[9px] text-[#999] tracking-[0.15em] uppercase">
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
                <span className="text-[#999]">
                    UTC {time}
                </span>
                <span className="text-[#777]">
                    UPTIME {fmtUptime}
                </span>

                {/* Session countdown */}
                {fmtRemaining && (
                    <span className={`flex items-center gap-1.5 font-mono ${
                        isExpiringSoon ? 'text-[#FF2020] animate-pulse' : 'text-[#888]'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                            isExpiringSoon ? 'bg-[#FF2020]' : 'bg-[#555]'
                        }`} />
                        SESSION {fmtRemaining}
                    </span>
                )}

                <button
                    onClick={logout}
                    className="text-[9px] text-[#FF2020]/60 hover:text-[#FF2020] tracking-widest uppercase transition-colors border border-[#FF2020]/20 hover:border-[#FF2020]/60 bg-[#FF2020]/5 hover:bg-[#FF2020]/10 px-2 py-1"
                >
                    TERMINATE SESSION
                </button>
            </div>
        </header>
    )
}
