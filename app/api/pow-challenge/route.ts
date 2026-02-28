import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Proof of Work Challenge Generator
 * 
 * If a session is marked SUSPICIOUS, they must request a challenge string here.
 * The challenge requires finding a nonce such that SHA-256(challenge + nonce) 
 * starts with N zeros (difficulty).
 */
export async function GET() {
    // Generate a random 16-byte hex challenge
    const challenge = crypto.randomBytes(16).toString('hex')

    // Difficulty: Requires finding a hash starting with "0000" (~65,536 iterations expected)
    // This takes an M1 Mac about 0.5s, an old phone about 2-3s.
    // It takes a Python script doing synchronous single-threaded hashing about 4s.
    const difficulty = 4

    // In a real production system, you would store `challenge` in Redis with a 30s TTL
    // to prevent replay attacks. For the hackathon demo, we will accept the math validity.

    return NextResponse.json({
        challenge,
        difficulty,
        algorithm: 'SHA-256',
        message: 'Find nonce where SHA-256(challenge + nonce).startsWith("0".repeat(difficulty))'
    })
}
