import { NextResponse } from 'next/server'
import { FASTAPI_URL } from '@/lib/backend-config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
    try {
        const apiRes = await fetch(`${FASTAPI_URL}/api/dashboard/public-stats`, {
            signal: AbortSignal.timeout(1500)
        })

        if (apiRes.ok) {
            const data = await apiRes.json()
            return NextResponse.json({
                ...data,
                status: 'ok',
                generatedAt: new Date().toISOString(),
            })
        }
        return NextResponse.json({
            active_sessions: 0,
            status: 'degraded',
            generatedAt: new Date().toISOString(),
        })
    } catch {
        return NextResponse.json({
            active_sessions: 0,
            status: 'degraded',
            generatedAt: new Date().toISOString(),
        })
    }
}
