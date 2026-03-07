import { NextResponse } from 'next/server'
import { createPowChallenge } from '@/lib/pow-store'

export const dynamic = 'force-dynamic'

/**
 * Proof of Work Challenge Generator
 * 
 * If a session is marked SUSPICIOUS, they must request a challenge string here.
 * The challenge requires finding a nonce such that SHA-256(challenge + nonce) 
 * starts with N zeros (difficulty).
 */
export async function GET() {
    // Difficulty: Requires finding a hash starting with "0000" (~65,536 iterations expected)
    // This takes an M1 Mac about 0.5s, an old phone about 2-3s.
    // It takes a Python script doing synchronous single-threaded hashing about 4s.
    const difficulty = 4
    const record = createPowChallenge(difficulty)

    return NextResponse.json({
        challenge: record.challenge,
        difficulty,
        expiresInSeconds: 30,
        algorithm: 'SHA-256',
        message: 'Find nonce where SHA-256(challenge + nonce).startsWith("0".repeat(difficulty))'
    })
}
