'use client'
// OpsAuthProvider — Auth context scoped to the secret /ops admin portal
// Uses a SEPARATE localStorage key ('bb-ops-token') so the decoy /dashboard
// and the real /ops portal never interfere with each other.

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface AuthContextType {
    token: string | null
    login: (token: string) => void
    logout: () => void
}

const OpsAuthContext = createContext<AuthContextType>({
    token: null,
    login: () => { },
    logout: () => { },
})

export function OpsAuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        const stored = localStorage.getItem('bb-ops-token')
        if (!stored) {
            setIsMounted(true)
            return
        }
        // Validate stored token against backend before trusting it.
        fetch('/api/threats', {
            headers: { 'Authorization': `Bearer ${stored}` }
        }).then(res => {
            if (res.status !== 401) {
                setToken(stored)
            } else {
                localStorage.removeItem('bb-ops-token')
            }
        }).catch(() => {
            // Backend unreachable — trust the stored token optimistically.
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
        setToken(newToken)
        localStorage.setItem('bb-ops-token', newToken)
        router.push('/ops')
    }

    const logout = () => {
        setToken(null)
        localStorage.removeItem('bb-ops-token')
        router.push('/ops/login')
    }

    if (!isMounted) return null

    if (!token && pathname?.startsWith('/ops') && pathname !== '/ops/login') {
        return <div className="min-h-screen bg-black" />
    }

    return (
        <OpsAuthContext.Provider value={{ token, login, logout }}>
            {children}
        </OpsAuthContext.Provider>
    )
}

export const useOpsAuth = () => useContext(OpsAuthContext)
