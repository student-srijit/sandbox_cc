'use client'

import { useState, useEffect, useCallback } from 'react'
import ThreatMap from '@/components/dashboard/ThreatMap'
import HoneypotSessions from '@/components/dashboard/HoneypotSessions'
import AttackTaxonomy from '@/components/dashboard/AttackTaxonomy'
import DOMMutationLog from '@/components/dashboard/DOMMutationLog'
import ThreatFeed from '@/components/ThreatFeed'
import SystemHealth from '@/components/dashboard/SystemHealth'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ThreatContainedTrigger from '@/components/dashboard/ThreatContainedTrigger'
import TrophyRoom from '@/components/dashboard/TrophyRoom'
import ContainmentPanel from '@/components/dashboard/ContainmentPanel'
import { useAuth } from '@/components/AuthProvider'

type ContainmentStatus = {
    active_count: number
    critical_incident: boolean
    critical_threat_id: string | null
    containments: Array<{ ip: string; mode: string; threat_id: string | null; age_seconds: number }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThreatLog = any

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'TROPHIES' | 'SOC'>('OVERVIEW')
    const [containment, setContainment] = useState<ContainmentStatus | null>(null)
    const [threatLogs, setThreatLogs] = useState<ThreatLog[]>([])
    const [criticalIncident, setCriticalIncident] = useState(false)
    const { token, logout } = useAuth()

    const fetchThreats = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch('/api/threats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.status === 401) {
                logout()
                return
            }
            if (!res.ok) return
            const data = await res.json()
            if (Array.isArray(data.logs)) setThreatLogs(data.logs)
            if (data.containment) {
                setContainment(data.containment)
                setCriticalIncident(data.containment.critical_incident === true)
            }
        } catch { }
    }, [token, logout])

    useEffect(() => {
        fetchThreats()
        const id = setInterval(fetchThreats, 3000)
        return () => clearInterval(id)
    }, [fetchThreats])

    return (
        <div
            className="w-full h-full bg-black overflow-hidden flex flex-col"
            style={criticalIncident ? {
                outline: '3px solid #FF0000',
                boxShadow: '0 0 40px #FF000044 inset',
            } : {}}
        >
            {/* Critical Incident Banner */}
            {criticalIncident && (
                <div className="flex-shrink-0 bg-[#FF0000] text-white text-center py-1 animate-pulse">
                    <span className="text-[9px] tracking-[0.4em] font-bold uppercase">
                        🚨 CRITICAL INCIDENT DECLARED — WAR ROOM MODE ACTIVE — SEE SOC PANEL
                    </span>
                </div>
            )}

            {/* Header */}
            <DashboardHeader />

            {/* Tab Navigation */}
            <div className="flex border-b border-[#222] bg-[#0a0a0a] flex-shrink-0">
                <button
                    onClick={() => setActiveTab('OVERVIEW')}
                    className={`px-6 py-2 text-[10px] tracking-widest font-bold transition-colors ${activeTab === 'OVERVIEW' ? 'text-[#00FF41] border-b-2 border-[#00FF41] bg-[#00FF41]/10' : 'text-[#666] hover:text-white'}`}
                >
                    TACTICAL OVERVIEW
                </button>
                <button
                    onClick={() => setActiveTab('SOC')}
                    className={`px-6 py-2 text-[10px] tracking-widest font-bold transition-colors flex items-center gap-2 ${activeTab === 'SOC' ? 'text-[#FF2020] border-b-2 border-[#FF2020] bg-[#FF2020]/10' : 'text-[#666] hover:text-white'}`}
                >
                    {criticalIncident && <span className="w-2 h-2 rounded-full bg-[#FF0000] animate-pulse flex-shrink-0" />}
                    <span className="text-xs">🛡️</span> SOC CONTAINMENT
                    {containment && containment.active_count > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[7px] bg-[#FF2020] text-white rounded-sm font-bold">
                            {containment.active_count}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('TROPHIES')}
                    className={`px-6 py-2 text-[10px] tracking-widest font-bold transition-colors flex items-center gap-2 ${activeTab === 'TROPHIES' ? 'text-[#FFD700] border-b-2 border-[#FFD700] bg-[#FFD700]/10' : 'text-[#666] hover:text-white'}`}
                >
                    <span className="text-xs">🏆</span> THE TROPHY ROOM
                </button>
            </div>

            {/* Main Content Area */}
            {activeTab === 'OVERVIEW' ? (
                <div className="flex-1 grid grid-cols-12 grid-rows-[1fr_1fr] gap-px overflow-hidden" style={{ minHeight: 0 }}>
                    {/* Row 1 */}
                    <div className="col-span-8 row-span-1 wr-panel overflow-hidden">
                        <ThreatMap />
                    </div>
                    <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                        <HoneypotSessions />
                    </div>

                    {/* Row 2 */}
                    <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                        <AttackTaxonomy />
                    </div>
                    <div className="col-span-4 row-span-1 wr-panel overflow-hidden">
                        <DOMMutationLog />
                    </div>
                    <div className="col-span-4 row-span-1 wr-panel flex flex-col overflow-hidden">
                        <ThreatFeed />
                    </div>
                </div>
            ) : activeTab === 'SOC' ? (
                <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                    <ContainmentPanel
                        logs={threatLogs}
                        containment={containment}
                        onRefresh={fetchThreats}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                    <TrophyRoom />
                </div>
            )}

            {/* Bottom Health Bar */}
            <SystemHealth />

            {/* Threat Contained Overlay (trigger wrapper) */}
            <ThreatContainedTrigger />
        </div>
    )
}

