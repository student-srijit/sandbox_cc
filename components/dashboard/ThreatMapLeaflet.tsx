'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  ZoomControl,
} from 'react-leaflet'
import { useAuth } from '@/components/AuthProvider'

interface ThreatMapLog {
  threat_id: string
  network?: {
    tier?: string
    entry_ip?: string
    geo?: {
      lat?: number
      lon?: number
      city?: string
      country?: string
      hosting?: boolean
      proxy?: boolean
    }
  }
  classification?: {
    attack_type?: string
    confidence?: number
  }
}

interface ThreatMapStats {
  total: number
  bots: number
  suspicious: number
}

interface ThreatMapResponse {
  stats?: ThreatMapStats
  logs?: ThreatMapLog[]
}

type MapStyleKey = 'street' | 'dark' | 'satellite' | 'terrain'

type ThreatPin = {
  id: string
  lat: number
  lon: number
  attackType: string
  confidence: number
  ip: string
  city: string
  country: string
  severity: 'critical' | 'elevated' | 'normal'
}

const MAP_STYLES: Record<MapStyleKey, { label: string; url: string; attribution: string }> = {
  street: {
    label: 'STREET',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  dark: {
    label: 'DARK',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  satellite: {
    label: 'SATELLITE',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  terrain: {
    label: 'TERRAIN',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors',
  },
}

const MAP_BOUNDS: [[number, number], [number, number]] = [[-85, -180], [85, 180]]

function pinFromLog(log: ThreatMapLog): ThreatPin | null {
  const geo = log.network?.geo
  const lat = geo?.lat
  const lon = geo?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return null
  }

  const clampedLat = Math.max(-85, Math.min(85, lat))
  const clampedLon = Math.max(-180, Math.min(180, lon))
  const isProxy = geo?.proxy === true
  const isHosting = geo?.hosting === true

  const severity: ThreatPin['severity'] = isProxy || isHosting
    ? 'critical'
    : (log.classification?.confidence ?? 0) >= 0.75
      ? 'elevated'
      : 'normal'

  return {
    id: log.threat_id,
    lat: clampedLat,
    lon: clampedLon,
    attackType: log.classification?.attack_type || 'UNKNOWN',
    confidence: typeof log.classification?.confidence === 'number'
      ? log.classification.confidence
      : 0,
    ip: log.network?.entry_ip || 'Unknown',
    city: geo?.city || 'Unknown',
    country: geo?.country || 'Unknown',
    severity,
  }
}

export default function ThreatMapLeaflet() {
  const { token } = useAuth()
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark')
  const [pins, setPins] = useState<ThreatPin[]>([])
  const [totalAttacks, setTotalAttacks] = useState(0)
  const [activeNow, setActiveNow] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  useEffect(() => {
    if (!token) return

    async function pollMapData() {
      try {
        const res = await fetch('/api/threats', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const data = (await res.json()) as ThreatMapResponse
        if (data.stats) {
          setTotalAttacks(data.stats.total)
          setActiveNow(data.stats.bots + data.stats.suspicious)
        }

        const nextPins = (data.logs || [])
          .filter((log) => log.network?.tier !== 'HUMAN')
          .map(pinFromLog)
          .filter((pin): pin is ThreatPin => pin !== null)

        setPins(nextPins)
        setLastUpdated(new Date().toLocaleTimeString())
      } catch {
        // Keep the last successful render when the backend is temporarily unavailable.
      }
    }

    pollMapData()
    const id = setInterval(pollMapData, 2000)
    return () => clearInterval(id)
  }, [token])

  const styleConfig = useMemo(() => MAP_STYLES[mapStyle], [mapStyle])

  return (
    <div className="h-full flex flex-col bg-[#030a08]">
      <div className="wr-panel-header border-b border-[#113625]">
        <span className="wr-panel-title">GLOBAL THREAT MAP</span>
        <div className="flex items-center gap-4 text-[9px]">
          <span className="text-[#FF3030]">
            <span className="text-[13px] font-bold">{totalAttacks}</span> ATTACKS
          </span>
          <span className="text-[#00E38A]">
            <span className="text-[13px] font-bold">{activeNow}</span> LIVE
          </span>
          <span className="text-[#7f9190] hidden xl:inline">
            {pins.length} GEO-MAPPED
          </span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#0f2c21] bg-[#04110d] flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {(Object.keys(MAP_STYLES) as MapStyleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMapStyle(key)}
              className={`px-2 py-1 text-[9px] tracking-[0.18em] border transition-colors ${mapStyle === key
                ? 'text-[#00ffd1] border-[#00ffd1]/60 bg-[#00ffd1]/12'
                : 'text-[#96aaa5] border-[#24453a] hover:text-white hover:border-[#3f6f5e]'
                }`}
            >
              {MAP_STYLES[key].label}
            </button>
          ))}
        </div>
        <div className="text-[9px] tracking-[0.14em] text-[#8ea09a] uppercase">
          Real Geo Only {lastUpdated ? `• Updated ${lastUpdated}` : ''}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          maxBounds={MAP_BOUNDS}
          maxBoundsViscosity={1}
          zoomControl={false}
          className="threat-leaflet h-full w-full"
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            url={styleConfig.url}
            attribution={styleConfig.attribution}
          />

          {pins.map((pin) => {
            const color = pin.severity === 'critical'
              ? '#ff2c2c'
              : pin.severity === 'elevated'
                ? '#ffb547'
                : '#00e38a'

            const radius = pin.severity === 'critical' ? 8 : pin.severity === 'elevated' ? 6 : 5

            return (
              <CircleMarker
                key={pin.id}
                center={[pin.lat, pin.lon]}
                radius={radius}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.32, weight: 2 }}
              >
                <Popup>
                  <div className="text-[12px] leading-5">
                    <div><strong>Threat:</strong> {pin.id}</div>
                    <div><strong>Attack Type:</strong> {pin.attackType}</div>
                    <div><strong>Source:</strong> {pin.city}, {pin.country}</div>
                    <div><strong>IP:</strong> {pin.ip}</div>
                    <div><strong>Confidence:</strong> {(pin.confidence * 100).toFixed(0)}%</div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-[#020a07]/90 border border-[#1f3e34] px-6 py-4 text-center">
              <div className="text-[11px] tracking-[0.2em] text-[#95aea6] uppercase">No Real Geo Signals Yet</div>
              <div className="text-[10px] text-[#6d817a] mt-1">
                Waiting for incoming threats with resolved latitude and longitude.
              </div>
            </div>
          </div>
        )}

        <div className="absolute left-3 bottom-2 px-2 py-1 border border-[#214639] bg-[#04130e]/85 text-[8px] text-[#9fb2ab] tracking-[0.12em] uppercase">
          Marker Color: Green Normal • Amber Elevated • Red Hosting/Proxy
        </div>
      </div>
    </div>
  )
}
