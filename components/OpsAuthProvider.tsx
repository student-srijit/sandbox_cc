'use client'
// OpsAuthProvider — Auth context scoped to the secret /ops admin portal
// Uses a SEPARATE localStorage key ('bb-ops-token') so the decoy /dashboard
// and the real /ops portal never interfere with each other.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AuthContext } from '@/components/AuthProvider'

interface OpsAuthContextType {
    token: string | null
    sessionExpiresAt: number | null
    login: (token: string) => void
    logout: () => void
}

const OpsAuthContext = createContext<OpsAuthContextType>({
    token: null,
    sessionExpiresAt: null,
    login: () => { },
    logout: () => { },
})

const SESSION_MS = 30 * 60 * 1000 // 30 minutes

export function OpsAuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        const stored = localStorage.getItem('bb-ops-token')
        const expiresAt = Number(localStorage.getItem('bb-ops-session-expires') || '0')

        if (!stored || (expiresAt && Date.now() >= expiresAt)) {
            localStorage.removeItem('bb-ops-token')
            localStorage.removeItem('bb-ops-session-expires')
            setIsMounted(true)
            return
        }

        if (expiresAt) setSessionExpiresAt(expiresAt)

        fetch('/api/threats', {
            headers: { 'Authorization': `Bearer ${stored}` }
        }).then(res => {
            if (res.status !== 401) {
                setToken(stored)
            } else {
                localStorage.removeItem('bb-ops-token')
                localStorage.removeItem('bb-ops-session-expires')
            }
        }).catch(() => {
            setToken(stored)
        }).finally(() => {
            setIsMounted(true)
        })
    }, [])

    useEffect(() => {
        if (!isMounted) return
        if (!token && pathname?.startsWith('/ops') && pathname !== '/ops/login') {
            router.replace('/ops/login')
        }
        if (token && pathname === '/ops/login') {
            router.replace('/ops')
        }
    }, [token, pathname, isMounted, router])

    const login = (newToken: string) => {
        const expiresAt = Date.now() + SESSION_MS
        setToken(newToken)
        setSessionExpiresAt(expiresAt)
        localStorage.setItem('bb-ops-token', newToken)
        localStorage.setItem('bb-ops-session-expires', String(expiresAt))
        router.push('/ops')
    }

    const logout = useCallback(() => {
        const t = localStorage.getItem('bb-ops-token')
        if (t) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${t}` }
            }).catch(() => {})
        }
        setToken(null)
        setSessionExpiresAt(null)
        localStorage.removeItem('bb-ops-token')
        localStorage.removeItem('bb-ops-session-expires')
        router.push('/ops/login')
    }, [router])

    // Auto-expire session after 30 minutes
    useEffect(() => {
        if (!sessionExpiresAt) return
        const check = setInterval(() => {
            if (Date.now() >= sessionExpiresAt) logout()
        }, 1000)
        return () => clearInterval(check)
    }, [sessionExpiresAt, logout])

    if (!isMounted) return null

    if (!token && pathname?.startsWith('/ops') && pathname !== '/ops/login') {
        return <div className="min-h-screen bg-black" />
    }

    return (
        <OpsAuthContext.Provider value={{ token, sessionExpiresAt, login, logout }}>
            <AuthContext.Provider value={{ token, sessionExpiresAt, login, logout }}>
                {children}
            </AuthContext.Provider>
        </OpsAuthContext.Provider>
    )
}

export const useOpsAuth = () => useContext(OpsAuthContext)
