'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface AuthContextType {
    token: string | null
    sessionExpiresAt: number | null
    login: (token: string) => void
    logout: () => void
}

export const AuthContext = createContext<AuthContextType>({
    token: null,
    sessionExpiresAt: null,
    login: () => { },
    logout: () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    const SESSION_MS = 30 * 60 * 1000 // 30 minutes

    useEffect(() => {
        const stored = localStorage.getItem('bb-auth-token')
        const expiresAt = Number(localStorage.getItem('bb-session-expires') || '0')

        // Clear everything if no token or session already expired
        if (!stored || (expiresAt && Date.now() >= expiresAt)) {
            localStorage.removeItem('bb-auth-token')
            localStorage.removeItem('bb-session-expires')
            setIsMounted(true)
            return
        }

        if (expiresAt) setSessionExpiresAt(expiresAt)

        // Validate the stored token against the backend before trusting it.
        fetch('/api/threats', {
            headers: { 'Authorization': `Bearer ${stored}` }
        }).then(res => {
            if (res.status !== 401) {
                setToken(stored)
            } else {
                localStorage.removeItem('bb-auth-token')
                localStorage.removeItem('bb-session-expires')
            }
        }).catch(() => {
            // Backend unreachable — trust stored token optimistically.
            setToken(stored)
        }).finally(() => {
            setIsMounted(true)
        })
    }, [])

    useEffect(() => {
        if (!isMounted) return

        // If we don't have a token and we are trying to access a dashboard route...
        if (!token && pathname?.startsWith('/dashboard') && pathname !== '/dashboard/login') {
            router.replace('/dashboard/login')
        }

        // If we have a token and we are on the login page...
        if (token && pathname === '/dashboard/login') {
            router.replace('/dashboard')
        }
    }, [token, pathname, isMounted, router])

    const login = (newToken: string) => {
        const expiresAt = Date.now() + SESSION_MS
        setToken(newToken)
        setSessionExpiresAt(expiresAt)
        localStorage.setItem('bb-auth-token', newToken)
        localStorage.setItem('bb-session-expires', String(expiresAt))
        router.push('/dashboard')
    }

    const logout = useCallback(() => {
        // Revoke the token on the backend (fire-and-forget)
        const t = localStorage.getItem('bb-auth-token')
        if (t) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${t}` }
            }).catch(() => {})
        }
        setToken(null)
        setSessionExpiresAt(null)
        localStorage.removeItem('bb-auth-token')
        localStorage.removeItem('bb-session-expires')
        router.push('/dashboard/login')
    }, [router])

    // Auto-expire the session after 30 minutes
    useEffect(() => {
        if (!sessionExpiresAt) return
        const check = setInterval(() => {
            if (Date.now() >= sessionExpiresAt) {
                logout()
            }
        }, 1000)
        return () => clearInterval(check)
    }, [sessionExpiresAt, logout])

    // Do not render children until mounted to prevent hydration errors 
    if (!isMounted) return null

    // If we're on a protected route and don't have a token, return null 
    // to prevent brief flash of authorized content before the redirect router catches up
    if (!token && pathname?.startsWith('/dashboard') && pathname !== '/dashboard/login') {
        return <div className="min-h-screen bg-black" />
    }

    return (
        <AuthContext.Provider value={{ token, sessionExpiresAt, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
