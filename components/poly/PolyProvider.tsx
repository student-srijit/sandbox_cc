'use client'

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react'
import { getMutationMap, PolyClass } from '@/lib/poly/mutate'

declare global {
    interface Window {
        __BB_SEED__?: string;
    }
}

interface PolyContextType {
    seed: string
    mutationMap: Record<string, string>
}

const PolyContext = createContext<PolyContextType>({
    seed: '',
    mutationMap: {},
})

/**
 * PolyProvider: Distributes the session-scoped CSS class mapping.
 * 
 * CRITICAL HYDRATION SAFETY:
 * React requires the server HTML and the first client render to match perfectly.
 * If the server mutates classes with Seed A, and the client uses Seed B, React throws 
 * Error #418/#423 and the page breaks.
 * 
 * We solve this by injecting `<script>window.__BB_SEED__="..."</script>` in layout.tsx.
 * The client initializer reads this global *synchronously* before hydration begins.
 */
export function PolyProvider({ children, serverSeed }: { children: React.ReactNode, serverSeed: string }) {
    // 1. Resolve the source of truth for the seed (Server prop vs Client global window)
    const initialSeed = typeof window !== 'undefined'
        ? (window.__BB_SEED__ || serverSeed)
        : serverSeed

    const [seed, setSeed] = useState(initialSeed)

    // 2. Compute the mutation map deterministically
    const mutationMap = useMemo(() => {
        return getMutationMap(seed)
    }, [seed])

    // 3. Ensure client stays perfectly synced
    useEffect(() => {
        if (typeof window !== 'undefined' && window.__BB_SEED__ && window.__BB_SEED__ !== seed) {
            console.warn('[Polymorphic Engine] Seed drift detected. Resyncing client context.')
            setSeed(window.__BB_SEED__)
        }
    }, [seed])

    return (
        <PolyContext.Provider value={{ seed, mutationMap }}>
            {children}
        </PolyContext.Provider>
    )
}

/**
 * Hook to retrieve the cryptographically mutated class name for a given semantic target.
 * 
 * @param semanticClassName The base class (e.g., 'connect-wallet-btn')
 * @returns The mutated hash class (e.g., 'bb-7a2f9c-btn'), or the original if unmapped.
 */
export function usePolyClass(semanticClassName: PolyClass): string {
    const { mutationMap } = useContext(PolyContext)

    // If no seed/map exists (fallback safety), return the semantic name so baseline CSS works
    return mutationMap[semanticClassName] || semanticClassName
}
