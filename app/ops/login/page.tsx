'use client'

import { useState, useEffect } from 'react'
import { useOpsAuth } from '@/components/OpsAuthProvider'

export default function OpsLoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [totpCode, setTotpCode] = useState('')
    const [error, setError] = useState('')
    const [activeSessions, setActiveSessions] = useState(0)
    const [loading, setLoading] = useState(false)
    const { login } = useOpsAuth()

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch('/api/dashboard/public-stats')
                if (res.ok) {
                    const data = await res.json()
                    setActiveSessions(data.active_sessions || 0)
                }
            } catch { }
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
            const body: Record<string, string> = { username, password }
            if (totpCode) body.totp_code = totpCode

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                if (data.error === 'totp_required') {
                    setError('Enter your 6-digit authenticator code below')
                } else if (data.error === 'invalid_totp') {
                    setError('Invalid authenticator code — try again')
                } else {
                    setError('Unauthorized credentials')
                }
                setLoading(false)
                return
            }

            if (data.token) {
                login(data.token)
            }
        } catch {
            setError('Authentication subsystem offline')
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center">
                <svg width="600" height="600" viewBox="0 0 100 100">
                    <polygon points="50 1 95 25 95 75 50 99 5 75 5 25" fill="none" stroke="#00FFD1" strokeWidth="0.5" />
                    <polygon points="50 10 85 30 85 70 50 90 15 70 15 30" fill="none" stroke="#00FFD1" strokeWidth="0.5" />
                    <polygon points="50 20 75 35 75 65 50 80 25 65 25 35" fill="none" stroke="#FFB800" strokeWidth="0.5" />
                </svg>
            </div>

            <div className="z-10 w-full max-w-sm">
                <div className="text-center mb-12">
                    <h1 className="text-2xl font-bold tracking-[0.3em] text-[#00FFD1] mb-2">OPERATIONS CENTER</h1>
                    <p className="text-[#aaa] text-[10px] tracking-widest uppercase">Restricted Access — Authorized Personnel Only</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-[#030303] border border-[#222] p-8 relative">
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00FFD1]"></div>
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00FFD1]"></div>
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00FFD1]"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00FFD1]"></div>

                    <div className="mb-6 text-center text-[10px] tracking-widest text-[#00FFD1] flex flex-col items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00FFD1] animate-pulse"></span>
                        {activeSessions} ACTIVE THREAT SESSIONS
                    </div>

                    <div className="space-y-4">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="USERNAME"
                            className="w-full bg-[#0a0a0a] border border-[#333] text-[#00FFD1] px-4 py-3 text-sm tracking-widest outline-none focus:border-[#00FFD1]"
                            required
                            autoComplete="username"
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="PASSWORD"
                            className="w-full bg-[#0a0a0a] border border-[#333] text-[#00FFD1] px-4 py-3 text-sm tracking-widest outline-none focus:border-[#00FFD1]"
                            required
                            autoComplete="current-password"
                        />
                        <div>
                            <input
                                type="text"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="AUTHENTICATOR CODE (6 DIGITS)"
                                className="w-full bg-[#0a0a0a] border border-[#444] text-[#FFD700] px-4 py-3 text-sm tracking-widest outline-none focus:border-[#FFD700] font-mono"
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                            />
                            <p className="mt-1 text-[8px] text-[#555] tracking-wider">
                                Open Google Authenticator and enter your 6-digit code
                            </p>
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
                        className="w-full mt-8 bg-[#00FFD1]/10 text-[#00FFD1] border border-[#00FFD1] py-3 text-xs tracking-[0.2em] font-bold hover:bg-[#00FFD1] hover:text-black transition-colors disabled:opacity-50"
                    >
                        {loading ? 'VERIFYING...' : 'AUTHENTICATE'}
                    </button>
                </form>

                <div className="mt-8 text-center text-[9px] text-[#777] tracking-widest uppercase">
                    Multi-Factor Authentication Required
                </div>
            </div>
        </div>
    )
}
