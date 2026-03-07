'use client'

import { useEffect, useMemo, useState } from 'react'

type HealthPayload = {
  status: 'ok' | 'degraded'
  timestamp: string
  metrics: {
    backendLatencyMs: number | null
    activeSessions: number | null
    nodeHeapUsedMb: number | null
    sepoliaRpcLatencyMs: number | null
    sepoliaBlockNumber: number | null
    celoRpcLatencyMs: number | null
    celoBlockNumber: number | null
  }
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 84
  const height = 20
  if (data.length < 2) return <div style={{ width, height }} />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`)
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1" />
      <circle cx={(data.length - 1) * stepX} cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2} r="2" fill={color} />
    </svg>
  )
}

export default function SystemHealth() {
  const [history, setHistory] = useState<Record<string, number[]>>({
    backendLatency: [0],
    activeSessions: [0],
    nodeHeap: [0],
    sepoliaLatency: [0],
    celoLatency: [0],
  })
  const [payload, setPayload] = useState<HealthPayload | null>(null)

  useEffect(() => {
    async function pullHealth() {
      try {
        const res = await fetch('/api/system-health', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as HealthPayload
        setPayload(data)

        setHistory((prev) => ({
          backendLatency: [...prev.backendLatency, data.metrics.backendLatencyMs ?? 0].slice(-40),
          activeSessions: [...prev.activeSessions, data.metrics.activeSessions ?? 0].slice(-40),
          nodeHeap: [...prev.nodeHeap, data.metrics.nodeHeapUsedMb ?? 0].slice(-40),
          sepoliaLatency: [...prev.sepoliaLatency, data.metrics.sepoliaRpcLatencyMs ?? 0].slice(-40),
          celoLatency: [...prev.celoLatency, data.metrics.celoRpcLatencyMs ?? 0].slice(-40),
        }))
      } catch {
        // Keep last known health data visible.
      }
    }

    pullHealth()
    const id = setInterval(pullHealth, 5000)
    return () => clearInterval(id)
  }, [])

  const metrics = useMemo(() => {
    return [
      {
        key: 'backendLatency',
        label: 'BACKEND LAT',
        value: payload?.metrics.backendLatencyMs,
        unit: 'ms',
        color: '#00FF41',
      },
      {
        key: 'activeSessions',
        label: 'ACTIVE SESS',
        value: payload?.metrics.activeSessions,
        unit: '',
        color: '#FFB800',
      },
      {
        key: 'nodeHeap',
        label: 'NODE HEAP',
        value: payload?.metrics.nodeHeapUsedMb,
        unit: 'MB',
        color: '#00FFD1',
      },
      {
        key: 'sepoliaLatency',
        label: 'SEPOLIA RPC',
        value: payload?.metrics.sepoliaRpcLatencyMs,
        unit: 'ms',
        color: '#7FA8FF',
      },
      {
        key: 'celoLatency',
        label: 'CELO RPC',
        value: payload?.metrics.celoRpcLatencyMs,
        unit: 'ms',
        color: '#7EF2A7',
      },
    ]
  }, [payload])

  const statusOk = payload?.status === 'ok'

  return (
    <div className="h-12 flex items-center border-t border-[#1a1a1a] bg-black px-4 gap-0 flex-shrink-0 overflow-x-auto">
      {metrics.map((metric, i) => (
        <div
          key={metric.key}
          className="flex items-center gap-2 px-3 h-full"
          style={{ borderRight: i < metrics.length - 1 ? '1px solid #111' : 'none' }}
        >
          <Sparkline data={history[metric.key] || [0]} color={metric.color} />
          <div className="flex flex-col">
            <span className="text-[6px] text-[#888] tracking-[0.15em] uppercase whitespace-nowrap leading-none">{metric.label}</span>
            <span className="text-[13px] font-bold tabular-nums leading-none mt-0.5" style={{ color: metric.color }}>
              {typeof metric.value === 'number' ? Math.round(metric.value) : '--'}
              <span className="text-[7px] text-[#777] ml-0.5">{metric.unit}</span>
            </span>
          </div>
        </div>
      ))}

      <div className="ml-auto flex items-center gap-2 pl-4">
        <span className={`w-1.5 h-1.5 rounded-full ${statusOk ? 'bg-[#00FF41]' : 'bg-[#FF3030]'}`} />
        <span className="text-[8px] text-[#888] tracking-widest uppercase">
          {statusOk ? 'REAL-TIME SYSTEM HEALTH' : 'DEGRADED - CHECK BACKEND/RPC'}
        </span>
      </div>
    </div>
  )
}
