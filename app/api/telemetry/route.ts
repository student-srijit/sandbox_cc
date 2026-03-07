import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { insertThreatLog } from '@/lib/db'
import {
    ClientSignals,
    scoreMouseEntropy,
    scoreBrowserApis,
    scoreCanvasFingerprint,
    scoreTiming,
    determineTier
} from '@/lib/scoring'
import { decryptTicket } from '@/lib/poly/crypto'

function isValidClientSignals(input: unknown): input is ClientSignals {
    if (!input || typeof input !== 'object') return false
    const data = input as Record<string, unknown>

    const numericFields: Array<keyof ClientSignals> = [
        'mouseEventsCount',
        'mousePathLinearity',
        'mouseSpeedVariance',
        'pluginsCount',
        'languagesCount',
        'screenWidth',
        'screenHeight',
        'timeToFirstInteraction',
    ]

    for (const field of numericFields) {
        if (typeof data[field] !== 'number' || !Number.isFinite(data[field] as number)) {
            return false
        }
    }

    if (typeof data.webdriver !== 'boolean') return false
    if (typeof data.hasChromeGlobal !== 'boolean') return false
    if (typeof data.isChromeUa !== 'boolean') return false
    if (typeof data.canvasHash !== 'string') return false

    return true
}

export async function POST(request: NextRequest) {
    try {
        const payload: unknown = await request.json()
        if (!isValidClientSignals(payload)) {
            return NextResponse.json({ error: 'Invalid telemetry payload structure.' }, { status: 400 })
        }
        const signals: ClientSignals = payload

        // 1. Calculate Client-Side Score
        const mouseRes = scoreMouseEntropy(signals)
        const apiRes = scoreBrowserApis(signals)
        const canvasRes = scoreCanvasFingerprint(signals)
        const timingRes = scoreTiming(signals)

        const clientScore = mouseRes.total + apiRes.total + canvasRes.total + timingRes.total

        const clientDetails = [
            ...mouseRes.details,
            ...apiRes.details,
            ...canvasRes.details,
            ...timingRes.details
        ]

        // 2. Extract Server-Side Score (Calculated earlier by edge middleware)
        let serverScore = 0
        let serverDetails = []
        const serverCookie = request.cookies.get('bb-server-score')?.value

        if (serverCookie) {
            const parts = serverCookie.split('|')
            if (parts.length === 2) {
                serverScore = parseInt(parts[0], 10) || 0
                try {
                    serverDetails = JSON.parse(atob(parts[1]))
                } catch {
                    // Ignore parse errors from tampered cookies
                }
            }
        } else {
            // If the server score cookie is missing, they bypassed the middleware entirely.
            serverScore += 50
            serverDetails.push({ check: 'Middleware Bypass', score: 50, reason: 'Request bypassed Edge Middleware entirely.' })
        }

        // 3. Compute Final Score & Tier
        const finalScore = Math.min(serverScore + clientScore, 100)
        const tier = determineTier(finalScore)

        // 4. Look up session hash from Polymorphic engine 
        const polyTicket = request.cookies.get('bb-poly-ticket')?.value
        let sessionHash = null
        if (polyTicket) {
            const seed = await decryptTicket(polyTicket)
            if (seed) sessionHash = seed.substring(0, 16).toUpperCase()
        }

        // 5. Store Threat Intelligence Record to SQLite
        const ip = request.ip || request.headers.get('x-forwarded-for') || '127.0.0.1'
        insertThreatLog({
            timestamp: Date.now(),
            ip_address: ip,
            user_agent: request.headers.get('user-agent'),
            session_hash: sessionHash,
            server_score: serverScore,
            client_score: clientScore,
            final_score: finalScore,
            tier: tier,
            server_breakdown: JSON.stringify(serverDetails),
            client_breakdown: JSON.stringify(clientDetails)
        })

        // 6. Return response and set final threat score cookie
        const response = NextResponse.json({
            score: finalScore,
            tier: tier,
            message: `Behavioral analysis complete. Tier assigned: ${tier}`
        })

        const existingSessionId = request.cookies.get('bb-session-id')?.value
        const derivedSessionId = existingSessionId || sessionHash || `anon-${Date.now()}`

        // Set HttpOnly secure cookie for the server to read on subsequent requests
        response.cookies.set({
            name: 'bb-threat-score',
            value: JSON.stringify({ score: finalScore, tier: tier }),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        })

        response.cookies.set({
            name: 'bb-threat-tier',
            value: tier,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        })

        response.cookies.set({
            name: 'bb-session-id',
            value: derivedSessionId,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        })

        // If active bot, signal the frontend to route to honeypot
        if (tier === 'BOT') {
            response.headers.set('X-BB-Redirect', 'honeypot')
        }

        return response

    } catch (error) {
        console.error('Telemetry ingest error:', error)
        return NextResponse.json({ error: 'Invalid telemetry payload structure.' }, { status: 400 })
    }
}
