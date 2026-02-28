'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'

interface AttackType {
    name: string
    count: number
    severity: number // 0-1, maps to amber→crimson gradient
}

export default function AttackTaxonomy() {
    const [attacks, setAttacks] = useState<AttackType[]>([])
    const total = attacks.reduce((s, a) => s + a.count, 0)

    const { token } = useAuth()

    // Pull real taxonomy aggregates from the backend
    useEffect(() => {
        if (!token) return

        async function fetchTaxonomy() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()

                if (data.stats && data.stats.taxonomy) {
                    setAttacks(data.stats.taxonomy)
                }
            } catch (err) { }
        }

        fetchTaxonomy()
        const id = setInterval(fetchTaxonomy, 1500)
        return () => clearInterval(id)
    }, [token])

    const maxCount = Math.max(1, ...attacks.map(a => a.count))

    return (
        <div className="h-full flex flex-col">
            <div className="wr-panel-header">
                <span className="wr-panel-title">ATTACK TAXONOMY</span>
                <span className="text-[9px] text-[#555]">TOTAL: <span className="text-[#FF2020] font-bold">{total}</span></span>
            </div>

            <div className="flex-1 flex flex-col justify-center px-4 gap-2 py-2">
                {attacks.map((a) => {
                    const pct = ((a.count / total) * 100).toFixed(1)
                    const barW = (a.count / maxCount) * 100

                    // Gradient position: 0=amber, 1=crimson
                    const r = Math.round(255 * (1 - a.severity * 0.3) + 255 * a.severity * 0.3)
                    const g = Math.round(184 * (1 - a.severity) + 32 * a.severity)
                    const b = Math.round(0 * (1 - a.severity) + 32 * a.severity)
                    const barColor = `rgb(${r},${g},${b})`

                    return (
                        <div key={a.name} className="flex items-center gap-2 text-[8px]">
                            <span className="w-[120px] flex-shrink-0 text-[#555] truncate text-right">
                                {a.name}
                            </span>
                            <div className="flex-1 h-[10px] bg-[#0a0a0a] rounded-sm overflow-hidden relative">
                                <div
                                    className="h-full rounded-sm transition-all duration-700 ease-out"
                                    style={{
                                        width: `${barW}%`,
                                        background: `linear-gradient(90deg, #FFB800, ${barColor})`,
                                        boxShadow: `0 0 8px ${barColor}33`,
                                    }}
                                />
                            </div>
                            <span className="w-[32px] text-right text-[#666] flex-shrink-0 tabular-nums">
                                {a.count}
                            </span>
                            <span className="w-[30px] text-right text-[#333] flex-shrink-0 tabular-nums">
                                {pct}%
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
