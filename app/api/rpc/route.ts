import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const FASTAPI_URL = 'http://127.0.0.1:8000'

export async function POST(req: NextRequest) {
    try {
        const body = await req.text()

        // 1. Extract the BB Telemetry scores from the cookies
        // We set these in the edge middleware and telemetry endpoints
        const cStore = cookies()
        const scoreCookie = cStore.get('bb-threat-score')
        const tierCookie = cStore.get('bb-threat-tier')
        const sessionCookie = cStore.get('bb-session-id')

        const isDemoOverride = req.headers.get('x-force-bot') === 'true'

        const threatScore = isDemoOverride ? '100' : (scoreCookie?.value || '0')
        const threatTier = isDemoOverride ? 'BOT' : (tierCookie?.value || 'UNKNOWN')
        const sessionId = sessionCookie?.value || 'anon-session'

        // 2. Proxy the raw JSON-RPC payload to the Live Python Honeypot
        // Pass the threat intelligence down via custom headers
        const apiRes = await fetch(`${FASTAPI_URL}/api/rpc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-BB-Threat-Score': threatScore,
                'X-BB-Tier': threatTier,
                'X-BB-Session': sessionId,
                // Forward the attacker's User-Agent for classifier analysis
                'User-Agent': req.headers.get('user-agent') || 'Unknown',
            },
            body: body,
            // 15 second timeout to allow LLaMA 3 time to generate a long response
            signal: AbortSignal.timeout(15000)
        })

        if (!apiRes.ok) {
            console.error("FastAPI returned error status:", apiRes.status)
            return NextResponse.json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal error checking routing" },
                id: null
            }, { status: 500 })
        }

        const responseData = await apiRes.json()

        return NextResponse.json(responseData)

    } catch (err) {
        console.error("Failed to proxy RPC to backend:", err)
        return NextResponse.json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal error" },
            id: null
        }, { status: 500 })
    }
}
