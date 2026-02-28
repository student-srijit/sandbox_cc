import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decryptTicket } from '@/lib/poly/crypto'
import { getMutationMap, POLY_CLASSES } from '@/lib/poly/mutate'

// Use Edge runtime for extreme performance (sub-50ms)
export const runtime = 'edge'

/**
 * Dynamic CSS Generation Pipeline
 * 
 * Intercepts style requests, verifies the session ticket, and generates
 * a completely unique, session-scoped CSS bundle by rewriting the AST/selectors
 * from the baseline fallback CSS.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Fetch the baseline static CSS
        // Using fetch because fs is not available in Edge runtime
        const origin = request.nextUrl.origin
        const cssRes = await fetch(`${origin}/fallback-poly.css`)

        if (!cssRes.ok) {
            return new NextResponse('/* Fallback CSS missing */', {
                status: 404,
                headers: { 'Content-Type': 'text/css' }
            })
        }

        let styles = await cssRes.text()

        // 2. Read the secure session ticket
        const ticket = request.cookies.get('bb-poly-ticket')?.value

        if (!ticket) {
            // No ticket -> Bot or expired session without middleware run.
            // Serve unmodified fallback CSS to gracefully degrade.
            return serveCSS(styles, false)
        }

        // 3. Decrypt and validate ticket
        const seed = await decryptTicket(ticket)

        if (!seed) {
            // Invalid or expired ticket -> Fallback CSS
            return serveCSS(styles, false)
        }

        // 4. Generate mutation mapping for this specific session
        const mutationMap = getMutationMap(seed)

        // 5. AST/String rewrite
        // For performance, we do direct string replacement of known classes.
        // In a heavier production app, this would use a fast AST traversal (like SWC).
        for (const semanticClass of POLY_CLASSES) {
            const mutatedClass = mutationMap[semanticClass]
            // Replace all instances of '.className' with '.mutatedName'
            // Note: CSS classes start with a dot. We use global regex replacement.
            const regex = new RegExp(`\\.${semanticClass}\\b`, 'g')
            styles = styles.replace(regex, `.${mutatedClass}`)
        }

        // 6. Serve uniquely mutated CSS
        return serveCSS(styles, true)

    } catch (error) {
        console.error('Poly CSS Generation Error:', error)
        return new NextResponse('/* Fatal Error: CSS Generation Failed */', {
            status: 500,
            headers: { 'Content-Type': 'text/css' }
        })
    }
}

/**
 * Helper to build the CSS response with proper headers
 */
function serveCSS(content: string, isMutated: boolean) {
    return new NextResponse(
        `/* BHOOL BHULAIYAA POLYMORPHIC SHIELD */\n/* Mutated: ${isMutated} */\n${content}`,
        {
            status: 200,
            headers: {
                'Content-Type': 'text/css; charset=utf-8',
                // Critical: Must be private so CDNs don't cache session-scoped CSS for other users
                'Cache-Control': 'private, max-age=900, must-revalidate',
            },
        }
    )
}
