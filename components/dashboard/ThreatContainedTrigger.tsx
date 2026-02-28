'use client'

import { useState, useEffect } from 'react'
import ThreatContained from './ThreatContained'

/**
 * Wrapper that manages the Threat Contained overlay state.
 * Auto-triggers after 8 seconds for demo, and provides
 * a manual trigger button in the dashboard header area.
 */
export default function ThreatContainedTrigger() {
    const [open, setOpen] = useState(false)

    // Auto-trigger after 8 seconds for demo
    useEffect(() => {
        const id = setTimeout(() => setOpen(true), 8000)
        return () => clearTimeout(id)
    }, [])

    return (
        <>
            {/* Manual trigger button — fixed in top-left, inside header zone */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    className="fixed top-1.5 left-[340px] z-50 px-3 py-1 text-[7px]
                     tracking-[0.2em] uppercase text-[#FF2020] border border-[#1a1a1a]
                     bg-[#0a0a0a] hover:bg-[#111] hover:border-[#FF2020]
                     transition-all duration-300 rounded-sm"
                    style={{ fontFamily: 'inherit' }}
                >
                    ⚠ SIMULATE TRAP
                </button>
            )}

            <ThreatContained open={open} onClose={() => setOpen(false)} />
        </>
    )
}
