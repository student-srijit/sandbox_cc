'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'

interface ReplayStep {
    step: number
    method: string
    params: string
    decoded_intent: string
    timestamp: string
    delta_ms: number
}

interface ReplayData {
    threat_id: string
    ip: string
    toolchain: string
    attack_type: string
    total_steps: number
    time_wasted_seconds: number
    steps: ReplayStep[]
}

interface Props {
    threatId: string
    onClose: () => void
}

const METHOD_COLOR: Record<string, string> = {
    eth_chainId: '#61affe',
    eth_accounts: '#61affe',
    eth_getBalance: '#49cc90',
    eth_blockNumber: '#49cc90',
    eth_sendTransaction: '#f93e3e',
    eth_sendRawTransaction: '#f93e3e',
    eth_call: '#fca130',
    eth_estimateGas: '#fca130',
    eth_defiExploitAttempt: '#f93e3e',
    eth_apidocsProbe: '#a855f7',
}

function methodColor(method: string): string {
    return METHOD_COLOR[method] ?? '#aaaaaa'
}

export default function SessionReplay({ threatId, onClose }: Props) {
    const { token } = useAuth()
    const [data, setData] = useState<ReplayData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Replay state
    const [playing, setPlaying] = useState(false)
    const [currentStep, setCurrentStep] = useState(0)
    const [visibleSteps, setVisibleSteps] = useState<ReplayStep[]>([])
    const [speed, setSpeed] = useState<'FAST' | 'REAL' | 'SLOW'>('FAST')
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const feedRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!token) return
        async function load() {
            try {
                const res = await fetch(`/api/replay/${threatId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!res.ok) throw new Error('Not found')
                const json = await res.json()
                setData(json)
            } catch {
                setError('Could not load replay data. Session may not have been flushed to DB yet.')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [token, threatId])

    // Auto-scroll feed on new step
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight
        }
    }, [visibleSteps])

    function getDelay(step: ReplayStep): number {
        if (speed === 'FAST') return 350
        if (speed === 'SLOW') return 2000
        // REAL — clamp between 200ms and 4000ms
        return Math.min(Math.max(step.delta_ms, 200), 4000)
    }

    function scheduleNextStep(stepIdx: number, steps: ReplayStep[]) {
        if (stepIdx >= steps.length) {
            setPlaying(false)
            return
        }
        const delay = getDelay(steps[stepIdx])
        timeoutRef.current = setTimeout(() => {
            setVisibleSteps(prev => [...prev, steps[stepIdx]])
            setCurrentStep(stepIdx + 1)
            scheduleNextStep(stepIdx + 1, steps)
        }, delay)
    }

    function startReplay() {
        if (!data) return
        setVisibleSteps([])
        setCurrentStep(0)
        setPlaying(true)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        scheduleNextStep(0, data.steps)
    }

    function stopReplay() {
        setPlaying(false)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    function resetReplay() {
        stopReplay()
        setVisibleSteps([])
        setCurrentStep(0)
    }

    // Cleanup on unmount
    useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

    const progress = data ? Math.round((currentStep / data.total_steps) * 100) : 0

    return (
        <div
            className="fixed inset-0 z-[1001] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[780px] max-h-[88vh] flex flex-col border border-[#1f1f1f] bg-[#080808] shadow-2xl">
                {/* ── Header ──────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="text-[#00FFD1] text-[10px] tracking-widest font-bold">⏵ SESSION REPLAY</div>
                        <div className="text-[#333] text-[10px]">|</div>
                        <div className="text-[#555] text-[10px] font-mono">{threatId}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[#444] hover:text-white text-xs transition-colors px-2"
                    >
                        ✕
                    </button>
                </div>

                {loading && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-[#333] text-xs tracking-widest animate-pulse">LOADING DOSSIER...</div>
                    </div>
                )}

                {error && (
                    <div className="flex-1 flex items-center justify-center px-8">
                        <div className="text-[#f93e3e] text-xs tracking-widest text-center">{error}</div>
                    </div>
                )}

                {data && !loading && (
                    <>
                        {/* ── Meta Row ────────────────────────────── */}
                        <div className="grid grid-cols-4 gap-px border-b border-[#111] shrink-0">
                            {[
                                { label: 'ORIGIN IP', value: data.ip },
                                { label: 'TOOLCHAIN', value: data.toolchain },
                                { label: 'ATTACK TYPE', value: data.attack_type },
                                { label: 'TIME WASTED', value: `${data.time_wasted_seconds}s` },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-[#0d0d0d] px-4 py-2.5">
                                        <div className="text-[8px] text-[#888] tracking-widest uppercase mb-1">{label}</div>
                                    <div className="text-[11px] text-white font-mono truncate">{value}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Controls ────────────────────────────── */}
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#111] shrink-0 bg-[#090909]">
                            {!playing ? (
                                <button
                                    onClick={startReplay}
                                    className="text-[9px] px-4 py-1.5 border border-[#00FFD1]/60 text-[#00FFD1] tracking-widest hover:bg-[#00FFD1]/10 transition-colors font-bold"
                                >
                                    ▶ PLAY
                                </button>
                            ) : (
                                <button
                                    onClick={stopReplay}
                                    className="text-[9px] px-4 py-1.5 border border-[#fca130]/60 text-[#fca130] tracking-widest hover:bg-[#fca130]/10 transition-colors font-bold"
                                >
                                    ⏸ PAUSE
                                </button>
                            )}
                            <button
                                onClick={resetReplay}
                                className="text-[9px] px-3 py-1.5 border border-[#333] text-[#555] tracking-widest hover:text-white hover:border-[#555] transition-colors"
                            >
                                ↺ RESET
                            </button>

                            <div className="flex items-center gap-1 ml-2">
                                {(['FAST', 'REAL', 'SLOW'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSpeed(s)}
                                        className="text-[8px] px-2 py-1 tracking-widest transition-colors border"
                                        style={{
                                            borderColor: speed === s ? '#00FFD1' : '#222',
                                            color: speed === s ? '#00FFD1' : '#444',
                                            background: speed === s ? 'rgba(0,255,209,0.08)' : 'transparent',
                                        }}
                                    >
                                        {s}
                                    </button>
                                ))}
                                <span className="text-[8px] text-[#333] tracking-widest ml-1">SPEED</span>
                            </div>

                            <div className="flex-1 mx-2">
                                <div className="h-px bg-[#1a1a1a] relative overflow-hidden">
                                    <div
                                        className="h-full bg-[#00FFD1] transition-all duration-300"
                                        style={{ width: `${progress}%`, opacity: 0.7 }}
                                    />
                                </div>
                            </div>

                            <div className="text-[9px] font-mono text-[#555] shrink-0">
                                {currentStep} / {data.total_steps}
                            </div>
                        </div>

                        {/* ── Feed ────────────────────────────────── */}
                        <div
                            ref={feedRef}
                            className="flex-1 overflow-y-auto font-mono text-[10px]"
                            style={{ background: '#060606' }}
                        >
                            {visibleSteps.length === 0 && !playing && (
                                <div className="flex items-center justify-center h-48">
                                    <div className="text-[#666] tracking-widest text-xs">
                                        Press ▶ PLAY to begin replaying {data.total_steps} captured calls
                                    </div>
                                </div>
                            )}

                            {visibleSteps.map((step, i) => (
                                <div
                                    key={step.step}
                                    className="flex gap-0 border-b border-[#0e0e0e] hover:bg-[#0d0d0d] transition-colors"
                                    style={{ animation: 'fadeInRow 0.2s ease-out' }}
                                >
                                    {/* Step number */}
                                    <div className="w-10 shrink-0 flex items-start pt-3 px-3 text-[8px] text-[#666] select-none">
                                        {String(step.step).padStart(2, '0')}
                                    </div>

                                    {/* Delta */}
                                    <div className="w-16 shrink-0 flex items-start pt-3 px-2 text-[8px] text-[#777]">
                                        +{step.delta_ms > 999 ? (step.delta_ms / 1000).toFixed(1) + 's' : step.delta_ms + 'ms'}
                                    </div>

                                    {/* Method */}
                                    <div
                                        className="w-52 shrink-0 pt-3 pb-3 pr-3 font-bold text-[10px] truncate"
                                        style={{ color: methodColor(step.method) }}
                                    >
                                        {step.method}
                                    </div>

                                    {/* Intent + params */}
                                    <div className="flex-1 pt-3 pb-3 pr-4 min-w-0">
                                        <div className="text-[#ccc] mb-1 truncate">{step.decoded_intent}</div>
                                        {step.params && step.params !== '[]' && step.params !== '{}' && (
                                            <div className="text-[#666] truncate text-[9px]">{step.params}</div>
                                        )}
                                    </div>

                                    {/* Live indicator on last step */}
                                    {i === visibleSteps.length - 1 && playing && (
                                        <div className="w-8 shrink-0 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#00FFD1] animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Completed banner */}
                            {!playing && currentStep === data.total_steps && currentStep > 0 && (
                                <div className="flex items-center justify-center py-6 border-t border-[#111]">
                                    <div className="text-[9px] tracking-widest text-[#00FFD1] border border-[#00FFD1]/30 px-4 py-2 bg-[#00FFD1]/5">
                                        ✓ REPLAY COMPLETE — {data.total_steps} CALLS ANALYSED
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <style jsx>{`
                @keyframes fadeInRow {
                    from { opacity: 0; transform: translateX(-6px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    )
}
