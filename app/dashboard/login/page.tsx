'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [activeSessions, setActiveSessions] = useState(0)
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()

    useEffect(() => {
        // Poll the public stats endpoint to tease the judges with the live attack count
        async function fetchStats() {
            try {
                const res = await fetch('/api/dashboard/public-stats')
                if (res.ok) {
                    const data = await res.json()
                    setActiveSessions(data.active_sessions || 0)
                }
            } catch (e) { }
        }
        fetchStats()
        const id = setInterval(fetchStats, 2000)
        return () => clearInterval(id)
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                setError('Unauthorized credentials')
                setLoading(false)
                return
            }

            if (data.token) {
                login(data.token)
            }
        } catch (e) {
            setError('Authentication subsystem offline')
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Hexagon background graphic */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center">
                <svg width="600" height="600" viewBox="0 0 100 100">
                    <polygon points="50 1 95 25 95 75 50 99 5 75 5 25" fill="none" stroke="#00FF41" strokeWidth="0.5" />
                    <polygon points="50 10 85 30 85 70 50 90 15 70 15 30" fill="none" stroke="#00FF41" strokeWidth="0.5" />
                    <polygon points="50 20 75 35 75 65 50 80 25 65 25 35" fill="none" stroke="#FFB800" strokeWidth="0.5" />
                </svg>
            </div>

            <div className="z-10 w-full max-w-sm">
                <div className="text-center mb-12">
                    <h1 className="text-2xl font-bold tracking-[0.3em] text-[#00FF41] mb-2">BHOOL BHULAIYAA</h1>
                    <p className="text-[#646464] text-[10px] tracking-widest uppercase">Threat Intelligence Center</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-[#030303] border border-[#222] p-8 relative">
                    {/* Corner accents */}
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00FF41]"></div>
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00FF41]"></div>
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00FF41]"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00FF41]"></div>

                    <div className="mb-6 text-center text-[10px] tracking-widest text-[#00FF41] flex flex-col items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse"></span>
                        {activeSessions} ACTIVE THREAT SESSIONS
                    </div>

                    <div className="space-y-4">
                        <div>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="USERNAME"
                                className="w-full bg-[#0a0a0a] border border-[#333] text-[#00FF41] px-4 py-3 text-sm tracking-widest outline-none focus:border-[#00FF41]"
                                required
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="PASSWORD"
                                className="w-full bg-[#0a0a0a] border border-[#333] text-[#00FF41] px-4 py-3 text-sm tracking-widest outline-none focus:border-[#00FF41]"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 text-center text-[#FF2020] text-[10px] tracking-widest">
                            [!] {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-8 bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41] py-3 text-xs tracking-[0.2em] font-bold hover:bg-[#00FF41] hover:text-black transition-colors disabled:opacity-50"
                    >
                        {loading ? 'VERIFYING...' : 'AUTHENTICATE'}
                    </button>
                </form>

                <div className="mt-8 text-center text-[9px] text-[#444] tracking-widest uppercase">
                    Authorized Personnel Only
                </div>
            </div>
        </div>
    )
}
