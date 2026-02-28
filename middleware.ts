import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { encryptTicket, decryptTicket } from './lib/poly/crypto'
import {
    scoreUserAgent,
    scoreHeaders,
    scorePathProb,
    scoreIpReputation,
    scoreServerTiming
} from './lib/scoring'

const TICKET_COOKIE = 'bb-poly-ticket'
const SEED_HEADER = 'x-poly-seed'
const HASH_HEADER = 'x-session-hash'
const EXPIRY_MINUTES = 15

export async function middleware(request: NextRequest) {
    // 1. Read existing ticket from cookies
    const existingTicket = request.cookies.get(TICKET_COOKIE)?.value
    let currentSeed: string | null = null

    // 2. Try to decrypt and validate it
    if (existingTicket) {
        currentSeed = await decryptTicket(existingTicket)
    }

    // 3. If missing or expired/invalid, generate a new seed
    let isNewSession = false
    if (!currentSeed) {
        // Generate 32 bytes of secure random entropy
        const randomBytes = crypto.getRandomValues(new Uint8Array(32))
        currentSeed = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        isNewSession = true
    }

    // 4. Create the session hash (first 16 chars) for the UI display
    const sessionHash = currentSeed.substring(0, 16).toUpperCase()

    // 5. Clone request headers to pass the decrypted seed down to SSR components
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set(SEED_HEADER, currentSeed)
    requestHeaders.set(HASH_HEADER, sessionHash)

    // 6. Return response with modified request headers
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    // 7. If we generated a new session, encrypt and set the cookie
    if (isNewSession) {
        const expiresAt = Date.now() + EXPIRY_MINUTES * 60 * 1000
        const newTicket = await encryptTicket(currentSeed, expiresAt)

        response.cookies.set({
            name: TICKET_COOKIE,
            value: newTicket,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: EXPIRY_MINUTES * 60,
        })
    } // End Poly Ticket Negotiation

    // =========================================================================
    // BOT FINGERPRINTING: SERVER-SIDE SCORING
    // Automatically analyzes incoming request signals without blocking UI
    // =========================================================================

    // 1. Extract raw signals
    const userAgent = request.headers.get('user-agent')
    const ip = request.ip || request.headers.get('x-forwarded-for') || '127.0.0.1'
    const path = request.nextUrl.pathname
    const hasReferrer = !!request.headers.get('referer')

    // 2. Run heuristic scoring rules
    const uaRes = scoreUserAgent(userAgent)
    const headerRes = scoreHeaders(request.headers)
    const probRes = scorePathProb(path, hasReferrer)
    const ipRes = scoreIpReputation(ip)
    const timingRes = scoreServerTiming(ip, path, hasReferrer)

    const serverScore = uaRes.total + headerRes.total + probRes.total + ipRes.total + timingRes.total

    // 3. Serialize the score breakdown to pass to the client/telemetry route
    const serverDetails = JSON.stringify([
        ...uaRes.details,
        ...headerRes.details,
        ...probRes.details,
        ...ipRes.details,
        ...timingRes.details
    ])

    // 4. Attach temporary server score cookie (to be absorbed by /api/telemetry)
    response.cookies.set({
        name: 'bb-server-score',
        value: `${serverScore}|${btoa(serverDetails)}`,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60, // Only needs to live 60s until telemetry posts back
    })

    return response
}

export const config = {
    // Apply middleware to all HTML/page requests and the poly-styles API route,
    // but explicitly avoid running it on static assets, images, etc. to save execution time.
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|\\.png|\\.jpg|\\.svg).*)',
    ],
}
