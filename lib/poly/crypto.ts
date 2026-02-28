/**
 * Web Crypto API AES-GCM Implementation for Edge Runtime
 * Next.js Middleware does not support Node.js `crypto`, so we must use
 * the native Web Crypto API to encrypt/decrypt session seeds.
 */

const SECRET_HEX = process.env.POLY_SECRET || '0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Converts a hex string to a Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2))
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    }
    return bytes
}

/**
 * Converts a Uint8Array to a Base64 string safely
 */
function bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(bytes)))
}

/**
 * Converts a Base64 string back to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
    const binString = atob(base64)
    const bytes = new Uint8Array(binString.length)
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i)
    }
    return bytes
}

/**
 * Derives an AES-GCM Web Crypto Key from the POLY_SECRET hex string
 */
async function getKey(): Promise<CryptoKey> {
    const secretBytes = hexToBytes(SECRET_HEX)
    return await crypto.subtle.importKey(
        'raw',
        secretBytes as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    )
}

/**
 * Encrypts the session seed and expiration time into a tamper-proof ticket.
 * Payload format: `seed|expiresAt`
 * Output format: `base64(iv).base64(ciphertext)`
 * 
 * @param seed The cryptographically random seed
 * @param expiresAt Unix timestamp in milliseconds when this ticket expires
 * @returns The encrypted ticket string
 */
export async function encryptTicket(seed: string, expiresAt: number): Promise<string> {
    const key = await getKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const payload = `${seed}|${expiresAt}`
    const encodedPayload = new TextEncoder().encode(payload)

    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        encodedPayload as BufferSource
    )

    const ciphertext = new Uint8Array(ciphertextBuffer)

    return `${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`
}

/**
 * Decrypts and validates a ticket.
 * Checks AES-GCM integrity and timestamp expiration.
 * 
 * @param ticket The ticket string `base64(iv).base64(ciphertext)`
 * @returns The decrypted seed, or null if invalid/expired
 */
export async function decryptTicket(ticket: string): Promise<string | null> {
    try {
        const parts = ticket.split('.')
        if (parts.length !== 2) return null

        const key = await getKey()
        const iv = base64ToBytes(parts[0])
        const ciphertext = base64ToBytes(parts[1])

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            ciphertext as BufferSource
        )

        const decoded = new TextDecoder().decode(decryptedBuffer)
        const [seed, expiresAtStr] = decoded.split('|')

        const expiresAt = parseInt(expiresAtStr, 10)
        if (Date.now() > expiresAt) {
            return null // Expired
        }

        return seed
    } catch (err) {
        // Decryption failed (tampered ticket or wrong secret)
        return null
    }
}
