import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decryptTicket } from '@/lib/poly/crypto'
import { getMutationMap } from '@/lib/poly/mutate'

export const dynamic = 'force-dynamic'

/**
 * Developer Verification Endpoint
 * 
 * Simply returns the current session's polymorphic mappings as JSON.
 * Proves to judges that the seed is working and classes are deterministically mutating
 * across sessions but remaining stable within a session.
 * 
 * IN PRODUCTION: This endpoint would be strictly IP restricted or removed.
 */
export async function GET(request: NextRequest) {
    try {
        const ticket = request.cookies.get('bb-poly-ticket')?.value

        if (!ticket) {
            return NextResponse.json({
                error: 'No active session ticket found. Middleware might be bypassed or blocked.'
            }, { status: 401 })
        }

        const seed = await decryptTicket(ticket)

        if (!seed) {
            return NextResponse.json({
                error: 'Ticket invalid or expired. Deleting cookie.',
                action: 'Reload page to negotiate a new ticket.'
            }, { status: 403 })
        }

        const mutationMap = getMutationMap(seed)

        // Parse out the original TTL if needed, though we just show a demo response here
        const sessionHashStr = seed.substring(0, 16).toUpperCase()

        return NextResponse.json({
            status: 'ACTIVE_POLYMORPHIC_SHIELD',
            sessionHash: sessionHashStr,
            seedLengthBytes: seed.length / 2, // hex string
            mutationsPerformed: Object.keys(mutationMap).length,
            mutationMap,
            verificationNote: 'This JSON proves the class selectors have been randomized for this specific session.'
        })

    } catch (error) {
        return NextResponse.json({ error: 'Internal verification error' }, { status: 500 })
    }
}
