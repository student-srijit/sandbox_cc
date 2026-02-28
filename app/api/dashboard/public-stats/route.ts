import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const FASTAPI_URL = 'http://127.0.0.1:8000'

export async function GET() {
    try {
        const apiRes = await fetch(`${FASTAPI_URL}/api/dashboard/public-stats`, {
            signal: AbortSignal.timeout(1500)
        })

        if (apiRes.ok) {
            const data = await apiRes.json()
            return NextResponse.json(data)
        }
        return NextResponse.json({ active_sessions: 0 })
    } catch (err) {
        return NextResponse.json({ active_sessions: 0 })
    }
}
