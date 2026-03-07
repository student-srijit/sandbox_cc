'use client'

import { useState, useEffect } from 'react'
import DashboardHeader from '@/components/dashboard/DashboardHeader'

// ─── Fake threat data pools ────────────────────────────────────────────────────
const FAKE_IPS = [
    '185.220.101.47', '46.161.14.22', '91.108.4.82', '104.21.18.4',
    '118.25.6.39', '45.33.32.156', '193.142.146.35', '77.247.181.163',
    '62.102.148.68', '2.58.56.101', '144.76.136.153', '5.188.206.14',
]
const FAKE_TOOLS = [
    'MetaMask Exploit Kit v2.1', 'drainer.js v4.0', 'web3.py custom scanner',
    'Mythril 0.23.15', 'Slither v0.9.5', 'Foundry cast CLI',
    'ethers.js exploit chain', 'WalletGen v3.8', 'node-drainer fork',
]
const FAKE_ATTACKS = [
    'WALLET_DRAINER', 'KEY_EXTRACTION', 'RPC_PROBING',
    'SESSION_HIJACK', 'REPLAY_ATTACK', 'PHISHING_PROBE', 'ABI_POISONING',
]
const FAKE_TIERS = ['BOT', 'BOT', 'SUSPICIOUS', 'BOT', 'BOT']
const FAKE_CONTAINMENTS = ['TAR_PIT', 'QUARANTINE', 'SHADOW_BAN', 'SINKHOLE']
const FAKE_METHODS = [
    'eth_call', 'eth_getBalance', 'eth_sendRawTransaction', 'eth_getCode',
    'eth_getLogs', 'personal_sign', 'eth_chainId', 'wallet_switchEthereumChain',
]

function seededRand(seed: number) {
    const x = Math.sin(seed + 1) * 10000
    return x - Math.floor(x)
}

function genFakeLog(index: number, tick = 0) {
    const s = index * 7 + tick * 3
    return {
        threat_id: `bb-${(0x1a2b3c + s * 0x17).toString(16).padStart(12, '0')}`,
        network: {
            entry_ip: FAKE_IPS[index % FAKE_IPS.length],
            tier: FAKE_TIERS[index % FAKE_TIERS.length],
        },
        classification: {
            attack_type: FAKE_ATTACKS[index % FAKE_ATTACKS.length],
            confidence: (0.72 + seededRand(s) * 0.26).toFixed(2),
            inferred_toolchain: FAKE_TOOLS[index % FAKE_TOOLS.length],
        },
        timeline: {
            first_seen: new Date(Date.now() - (index + tick) * 47000).toISOString(),
            total_requests: Math.floor(seededRand(s + 1) * 18) + 3,
        },
        payloads: [{ method: FAKE_METHODS[index % FAKE_METHODS.length] }],
        containment_mode: seededRand(s + 2) > 0.45 ? FAKE_CONTAINMENTS[index % FAKE_CONTAINMENTS.length] : null,
    }
}

export default function DecoyDashboardPage() {
    const [tick, setTick] = useState(0)
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SOC' | 'TROPHIES'>('OVERVIEW')
    const [fingerprintSent, setFingerprintSent] = useState(false)

    // Fire fingerprint beacon on first render — logs attacker OS/screen/timezone/IP to audit log
    useEffect(() => {
        if (!fingerprintSent) {
            setFingerprintSent(true)
            fetch('/api/decoy-threats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    screen: `${window.screen.width}x${window.screen.height}`,
                    platform: navigator.platform,
                    languages: navigator.languages?.join(',') ?? '',
                    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            }).catch(() => { })
        }
    }, [fingerprintSent])

    // Simulate live ticking threat data
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 3000)
        return () => clearInterval(id)
    }, [])

    const logs = Array.from({ length: 12 }, (_, i) => genFakeLog(i, tick))
    const activeContainments = logs.filter((l) => l.containment_mode)

    return (
        <div
            className="w-full h-full bg-black overflow-hidden flex flex-col"
            style={{ outline: '3px solid #FF000044', boxShadow: '0 0 40px #FF000022 inset' }}
        >
            {/* Always-active critical incident banner (deception) */}
            <div className="flex-shrink-0 bg-[#1a0000] text-[#FF2020] text-center py-1 animate-pulse">
                <span className="text-[9px] tracking-[0.4em] font-bold uppercase">
                    🚨 CRITICAL INCIDENT DECLARED — WAR ROOM MODE ACTIVE — SEE SOC PANEL
                </span>
            </div>

            <DashboardHeader />

            {/* Tab Bar */}
            <div className="flex border-b border-[#222] bg-[#0a0a0a] flex-shrink-0">
                {(['OVERVIEW', 'SOC', 'TROPHIES'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2 text-[10px] tracking-widest font-bold transition-colors flex items-center gap-2 ${activeTab === tab
                            ? tab === 'SOC' ? 'text-[#FF2020] border-b-2 border-[#FF2020] bg-[#FF2020]/10'
                                : tab === 'TROPHIES' ? 'text-[#FFD700] border-b-2 border-[#FFD700] bg-[#FFD700]/10'
                                    : 'text-[#00FF41] border-b-2 border-[#00FF41] bg-[#00FF41]/10'
                            : 'text-[#666] hover:text-white'
                            }`}
                    >
                        {tab === 'SOC' ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-[#FF0000] animate-pulse" />
                                🛡️ SOC CONTAINMENT
                                <span className="ml-1 px-1.5 py-0.5 text-[7px] bg-[#FF2020] text-white rounded-sm font-bold">
                                    {activeContainments.length}
                                </span>
                            </>
                        ) : tab === 'TROPHIES' ? '🏆 THE TROPHY ROOM' : 'TACTICAL OVERVIEW'}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-4 font-mono">
                {activeTab === 'OVERVIEW' && (
                    <div className="space-y-3">
                        <div className="text-[#00FF41] text-[10px] tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
                            LIVE THREAT FEED — {logs.length} ACTIVE SESSIONS
                        </div>
                        {logs.map((log) => (
                            <div
                                key={log.threat_id}
                                className="border border-[#1a2a1a] bg-[#050f05] p-3 flex items-start justify-between gap-2 text-[10px]"
                            >
                                <div className="space-y-1 min-w-0">
                                    <div className="text-[#FF2020] font-bold uppercase tracking-widest">
                                        {log.classification.attack_type}
                                    </div>
                                    <div className="text-[#777] truncate">
                                        {log.network.entry_ip} — {log.classification.inferred_toolchain}
                                    </div>
                                    <div className="text-[#555] text-[9px]">
                                        {log.payloads[0]?.method} · {log.timeline.total_requests} reqs · {new Date(log.timeline.first_seen).toLocaleTimeString()}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className={`px-2 py-0.5 text-[8px] font-bold uppercase ${log.network.tier === 'BOT'
                                        ? 'bg-[#FF2020]/20 text-[#FF2020] border border-[#FF2020]/30'
                                        : 'bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/30'
                                        }`}>
                                        {log.network.tier}
                                    </span>
                                    {log.containment_mode && (
                                        <span className="px-2 py-0.5 text-[8px] bg-[#00FFD1]/10 text-[#00FFD1] border border-[#00FFD1]/30">
                                            {log.containment_mode}
                                        </span>
                                    )}
                                    <span className="text-[#444] text-[9px]">conf: {log.classification.confidence}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'SOC' && (
                    <div className="space-y-3">
                        <div className="text-[#FF2020] text-[10px] tracking-widest mb-4">
                            ACTIVE CONTAINMENTS — {activeContainments.length} IPs ISOLATED
                        </div>
                        {activeContainments.map((log) => (
                            <div key={log.threat_id} className="border border-[#2a1a1a] bg-[#0f0505] p-3 text-[10px]">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-[#FF2020] font-bold">{log.network.entry_ip}</div>
                                        <div className="text-[#777] mt-1">{log.classification.attack_type} — {log.classification.inferred_toolchain}</div>
                                    </div>
                                    <span className="text-[#00FFD1] border border-[#00FFD1]/30 bg-[#00FFD1]/10 px-2 py-0.5 text-[8px] shrink-0 ml-2">
                                        {log.containment_mode}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'TROPHIES' && (
                    <div className="space-y-3">
                        <div className="text-[#FFD700] text-[10px] tracking-widest mb-4">🏆 CONTAINED THREATS — ALL TIME</div>
                        {Array.from({ length: 8 }, (_, i) => genFakeLog(i + 100, 0)).map((log) => (
                            <div key={log.threat_id} className="border border-[#2a2a1a] bg-[#0a0a05] p-3 text-[10px]">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-[#FFD700] font-bold">{log.classification.attack_type}</div>
                                        <div className="text-[#777] mt-1">{log.network.entry_ip} — {log.classification.inferred_toolchain}</div>
                                    </div>
                                    <span className="text-[#FFD700] text-[9px]">conf: {log.classification.confidence}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
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

