'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'

interface MutationNode {
    id: number
    x: number
    y: number
    parent: number | null
    type: string
}

const MUTATION_TYPES = ['MORPH', 'SHIFT', 'CLONE', 'SPLIT', 'MERGE', 'ROTATE', 'INJECT', 'MASK']

let nodeId = 0

export default function DOMMutationLog() {
    const [today, setToday] = useState(0)
    const [session, setSession] = useState(0)
    const [allTime, setAllTime] = useState(0)
    const [nodes, setNodes] = useState<MutationNode[]>([])
    const [rate, setRate] = useState<number>(0)

    const prevTime = useRef(Date.now())
    const initialMut = useRef(-1)
    const lastMut = useRef(0)
    const { token } = useAuth()

    useEffect(() => {
        if (!token) return

        async function fetchMutations() {
            try {
                const res = await fetch('/api/threats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) return
                const data = await res.json()

                if (data.stats && data.stats.mutations_total !== undefined) {
                    const currentMut = data.stats.mutations_total

                    if (initialMut.current === -1) {
                        initialMut.current = currentMut
                        lastMut.current = currentMut
                        setAllTime(currentMut)
                        setToday(currentMut)
                        return
                    }

                    const newMuts = currentMut - lastMut.current
                    if (newMuts > 0) {
                        const now = Date.now()
                        const deltaSecs = (now - prevTime.current) / 1000
                        const rateCalc = newMuts / Math.max(0.1, deltaSecs)

                        setRate(Math.round(rateCalc * 10) / 10)
                        prevTime.current = now

                        setAllTime(currentMut)
                        setToday(currentMut)
                        setSession(currentMut - initialMut.current)

                        // Add DNA nodes for each new mutation, capped at 10 to prevent SVG lag storms
                        const nodesToAdd = Math.min(newMuts, 10)
                        setNodes(prev => {
                            let nextNodes = [...prev]
                            for (let i = 0; i < nodesToAdd; i++) {
                                const newId = ++nodeId
                                const parentId = nextNodes.length > 0
                                    ? nextNodes[Math.max(0, nextNodes.length - 1 - Math.floor(Math.random() * 3))].id
                                    : null
                                const x = 20 + (newId % 24) * 22
                                const branch = Math.floor(newId / 24) % 4
                                const yBase = 20 + branch * 30
                                const yJitter = (Math.random() - 0.5) * 12
                                nextNodes.push({
                                    id: newId,
                                    x, y: yBase + yJitter,
                                    parent: parentId,
                                    type: MUTATION_TYPES[Math.floor(Math.random() * MUTATION_TYPES.length)]
                                })
                            }
                            return nextNodes.slice(-60)
                        })

                        lastMut.current = currentMut
                    } else {
                        // Decay the rate to 0 if no new mutations
                        setRate(0)
                        prevTime.current = Date.now()
                    }
                }
            } catch (err) { }
        }

        fetchMutations()
        const id = setInterval(fetchMutations, 1500)
        return () => clearInterval(id)
    }, [token])

    // Build connections map
    const nodesMap = new Map(nodes.map(n => [n.id, n]))

    return (
        <div className="h-full flex flex-col">
            <div className="wr-panel-header">
                <span className="wr-panel-title">POLYMORPHIC GENERATIONS</span>
                <span className="text-[9px] text-[#00FF41]">{rate} mut/s</span>
            </div>

            {/* Counters */}
            <div className="grid grid-cols-3 gap-px px-3 py-3">
                {[
                    { label: 'TODAY', value: today },
                    { label: 'SESSION', value: session },
                    { label: 'ALL-TIME', value: allTime },
                ].map(c => (
                    <div key={c.label} className="text-center">
                        <p className="text-[7px] text-[#333] tracking-[0.2em] uppercase mb-0.5">
                            {c.label}
                        </p>
                        <p className="text-[15px] font-bold text-[#00FF41] tabular-nums leading-none">
                            {c.value.toLocaleString()}
                        </p>
                    </div>
                ))}
            </div>

            {/* DNA Strand Visualization */}
            <div className="flex-1 overflow-hidden relative mx-2">
                <svg
                    viewBox="0 0 550 120"
                    preserveAspectRatio="xMidYMid slice"
                    className="w-full h-full"
                    aria-label="Mutation chain"
                >
                    {/* Connection lines (parent → child) */}
                    {nodes.map(n => {
                        if (!n.parent) return null
                        const parent = nodesMap.get(n.parent)
                        if (!parent) return null
                        return (
                            <line
                                key={`l-${n.id}`}
                                x1={parent.x} y1={parent.y}
                                x2={n.x} y2={n.y}
                                stroke="#00FF41"
                                strokeWidth="0.5"
                                opacity="0.2"
                            />
                        )
                    })}

                    {/* Nodes */}
                    {nodes.map((n, i) => {
                        const isRecent = i >= nodes.length - 3
                        const color = isRecent ? '#00FF41' : '#00FF41'
                        const opacity = 0.15 + 0.85 * (i / nodes.length)
                        return (
                            <g key={n.id}>
                                <circle
                                    cx={n.x} cy={n.y} r={isRecent ? 3 : 1.8}
                                    fill={color}
                                    opacity={opacity}
                                />
                                {isRecent && (
                                    <>
                                        <circle cx={n.x} cy={n.y} r="5" fill="none" stroke="#00FF41"
                                            strokeWidth="0.5" opacity="0.3">
                                            <animate attributeName="r" values="3;8;3" dur="2s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                                        </circle>
                                        <text x={n.x} y={n.y - 6} textAnchor="middle"
                                            fill="#00FF41" fontSize="4" opacity="0.5">
                                            {n.type}
                                        </text>
                                    </>
                                )}
                            </g>
                        )
                    })}
                </svg>
            </div>
        </div>
    )
}
