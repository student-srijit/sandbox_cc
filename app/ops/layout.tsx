import { IBM_Plex_Mono } from 'next/font/google'
import type { Metadata } from 'next'
import Topbar from '@/components/Topbar'
import { OpsAuthProvider } from '@/components/OpsAuthProvider'

const ibmPlexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700'],
    variable: '--font-ibm',
    display: 'swap',
})

export const metadata: Metadata = {
    title: 'Operations Center',
    description: 'Restricted access.',
}

export default function OpsLayout({
    children,
}: { children: React.ReactNode }) {
    return (
        <div className={`${ibmPlexMono.variable} ${ibmPlexMono.className} war-room flex flex-col`} style={{ height: '100vh' }}>
            <OpsAuthProvider>
                <div className="h-[64px] flex-shrink-0 z-50">
                    <Topbar />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    {children}
                </div>
            </OpsAuthProvider>
        </div>
    )
}
