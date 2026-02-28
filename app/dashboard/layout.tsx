import { IBM_Plex_Mono } from 'next/font/google'
import type { Metadata } from 'next'

const ibmPlexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700'],
    variable: '--font-ibm',
    display: 'swap',
})

export const metadata: Metadata = {
    title: 'BHOOL BHULAIYAA // THREAT INTELLIGENCE',
    description: 'War room threat intelligence dashboard — Bhool Bhulaiyaa honeypot monitoring system.',
}

import { AuthProvider } from '@/components/AuthProvider'

export default function DashboardLayout({
    children,
}: { children: React.ReactNode }) {
    return (
        <div className={`${ibmPlexMono.variable} ${ibmPlexMono.className} war-room`}>
            <AuthProvider>
                {children}
            </AuthProvider>
        </div>
    )
}
