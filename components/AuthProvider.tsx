'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface AuthContextType {
    token: string | null
    login: (token: string) => void
    logout: () => void
}

const AuthContext = createContext<AuthContextType>({
    token: null,
    login: () => { },
    logout: () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        setIsMounted(true)
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
        setToken(newToken)
        router.push('/dashboard')
    }

    const logout = () => {
        setToken(null)
        router.push('/dashboard/login')
    }

    // Do not render children until mounted to prevent hydration errors 
    if (!isMounted) return null

    // If we're on a protected route and don't have a token, return null 
    // to prevent brief flash of authorized content before the redirect router catches up
    if (!token && pathname?.startsWith('/dashboard') && pathname !== '/dashboard/login') {
        return <div className="min-h-screen bg-black" />
    }

    return (
        <AuthContext.Provider value={{ token, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
