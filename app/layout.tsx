import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { headers } from 'next/headers'
import { PolyProvider } from '@/components/poly/PolyProvider'
import { PolyErrorBoundary } from '@/components/poly/PolyErrorBoundary'
import { WalletProvider } from '@/components/WalletProvider'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Bhool Bhulaiyaa — Polymorphic Security Shield',
  description:
    'Next-generation Web3 security dApp. Polymorphic shield protecting your digital assets from evolving threats.',
  keywords: ['Web3', 'security', 'blockchain', 'DeFi', 'shield'],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the seed injected by the Next.js Edge Middleware
  const headersList = headers()
  const seed = headersList.get('x-poly-seed') || ''

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Load the Dynamically Mutated Session CSS */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/api/poly-styles" />

        {/* HYDRATION SAFETY: Inject seed as a global. 
            Runs immediately on parse, BEFORE React JS initializes. */}
        {seed && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__BB_SEED__ = "${seed}";`
            }}
          />
        )}

        {/* BEHAVIORAL FINGERPRINTING: Client-side telemetry payload. Runs silently without blocking UI. */}
        <script defer src="/telemetry.js"></script>
      </head>
      <body className={`${spaceGrotesk.className} overflow-hidden h-screen w-full`}>
        <PolyErrorBoundary>
          <PolyProvider serverSeed={seed}>
            <WalletProvider>
              {children}
            </WalletProvider>
          </PolyProvider>
        </PolyErrorBoundary>
      </body>
    </html>
  )
}
