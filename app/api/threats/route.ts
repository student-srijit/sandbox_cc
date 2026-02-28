import { NextResponse, NextRequest } from 'next/server'
import { getBotStats } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// The Python backend is running locally on 8000
const FASTAPI_URL = 'http://127.0.0.1:8000'

export async function GET(request: NextRequest) {
    try {
        // We still fetch the stats from our local Next.js metrics DB
        const stats: any = getBotStats()

        // Extract the Authorization header (Bearer JWT) sent by the React frontend
        const authHeader = request.headers.get('authorization')
        const fetchHeaders: Record<string, string> = {}
        if (authHeader) {
            fetchHeaders['Authorization'] = authHeader
        }

        // But the complex ThreatLogs now come from the FastAPI Intelligence logger
        let logs = []
        try {
            const apiRes = await fetch(`${FASTAPI_URL}/api/dashboard`, {
                headers: fetchHeaders,
                // Short timeout so the dashboard never hangs if python is down
                signal: AbortSignal.timeout(1500)
            })
            if (apiRes.ok) {
                const data = await apiRes.json()
                logs = data.logs || []

                // Merge the advanced Python backend aggregates (Taxonomy, Mutation counts)
                if (data.stats) {
                    stats.taxonomy = data.stats.taxonomy || []
                    stats.mutations_total = data.stats.mutations_total || 0
                    stats.bots = data.stats.bots || stats.bots
                }
            }
        } catch (backendErr) {
            console.error("FastAPI Backend unreachable:", backendErr)
        }

        return NextResponse.json({ logs, stats })
    } catch (err) {
        return NextResponse.json({ logs: [], stats: { total: 0, bots: 0, suspicious: 0 } })
    }
}
