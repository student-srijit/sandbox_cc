/**
 * Polymorphic DOM Engine: Core Mutation Logic
 * 
 * Provides deterministic but unpredictable CSS class mutations by combining
 * semantic class names with a session-scoped cryptographic seed using MurmurHash3.
 */

/**
 * List of critical semantic class names that will be mutated.
 * These are the components most frequently targeted by automated Web3 drainer bots.
 */
export const POLY_CLASSES = [
    'connect-wallet-btn',
    'shield-status',
    'threat-feed',
    'nav-logo',
    'stats-bar',
    'orbital-ring',
    'hero-section',
] as const

export type PolyClass = typeof POLY_CLASSES[number]

/**
 * MurmurHash3 (32-bit) Implementation
 * High-performance, non-cryptographic hash function perfect for rapid string hashing.
 * Implemented from scratch to avoid external npm dependencies and ensure Edge compatibility.
 * 
 * @param key The string to hash
 * @param seed Int32 seed value
 * @returns 32-bit unsigned integer hash
 */
function murmurHash3(key: string, seed: number): number {
    let h1b, k1

    const remainder = key.length & 3 // key.length % 4
    const bytes = key.length - remainder
    let h1 = seed
    const c1 = 0xcc9e2d51
    const c2 = 0x1b873593
    let i = 0

    while (i < bytes) {
        k1 =
            (key.charCodeAt(i) & 0xff) |
            ((key.charCodeAt(++i) & 0xff) << 8) |
            ((key.charCodeAt(++i) & 0xff) << 16) |
            ((key.charCodeAt(++i) & 0xff) << 24)
        ++i

        k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff
        k1 = (k1 << 15) | (k1 >>> 17)
        k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff

        h1 ^= k1
        h1 = (h1 << 13) | (h1 >>> 19)
        h1b = (((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16)) & 0xffffffff
        h1 = (h1b + 0xe6546b64) & 0xffffffff
    }

    k1 = 0
    switch (remainder) {
        case 3:
            k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16
        case 2:
            k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8
        case 1:
            k1 ^= (key.charCodeAt(i) & 0xff)
            k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff
            k1 = (k1 << 15) | (k1 >>> 17)
            k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff
            h1 ^= k1
    }

    h1 ^= key.length
    h1 ^= h1 >>> 16
    h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff
    h1 ^= h1 >>> 13
    h1 = (((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff
    h1 ^= h1 >>> 16

    // Ensure unsigned 32-bit integer
    return h1 >>> 0
}

/**
 * Converts a hex secret seed into an integer for MurmurHash3
 */
function seedToInt(seedStr: string): number {
    // Take first 8 chars of hex string = 32 bits
    return parseInt(seedStr.substring(0, 8), 16) || 0x12345678
}

/**
 * Mutates a semantic class name into a hashed, random-looking class name
 * that is deterministic per session seed.
 * 
 * @param semanticClassName The base class name (e.g., 'connect-wallet-btn')
 * @param seed The current session's cryptographic seed
 * @returns The mutated class name (e.g., 'bb-7a2f9c-btn')
 */
export function mutate(semanticClassName: string, seed: string): string {
    // If no seed exists (e.g., fallback during fatal error), return original
    if (!seed) return semanticClassName

    // Hash the combination of the secret seed and the class name
    const hashInt = murmurHash3(`${seed}:${semanticClassName}`, seedToInt(seed))

    // Convert hash to a 6-character hex string
    const hashHex = hashInt.toString(16).padStart(6, '0').substring(0, 6)

    // Extract a meaningful suffix from the semantic name for debugging (e.g. "-btn")
    const parts = semanticClassName.split('-')
    const suffix = parts.length > 1 ? `-${parts[parts.length - 1]}` : ''

    // Output format: bb-[hash]-[suffix]
    return `bb-${hashHex}${suffix}`
}

/**
 * Generates the complete mapping of all registered semantic class names
 * to their mutated equivalents for the given session seed.
 * 
 * Used by both the React provider (to map classes) and the CSS route (to rewrite rules).
 * 
 * @param seed The current session's cryptographic seed
 * @returns A Record mapping base names to mutated names
 */
export function getMutationMap(seed: string): Record<string, string> {
    const map: Record<string, string> = {}
    for (const className of POLY_CLASSES) {
        map[className] = mutate(className, seed)
    }
    return map
}
