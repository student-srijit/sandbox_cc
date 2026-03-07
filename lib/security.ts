/**
 * Next.js Edge-Level Request Encryption (E2EE Client)
 * Hybrid Encryption: AES-GCM for arbitrary JSON payload, RSA-OAEP for the AES Key.
 */

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlTnEbfUHd7S9nZNHdVw7
hPMnVPFizlXJdt/fHJuLnnIcuLTPboc5lIWSN0XEkF52tmMQKs1ppf20dkWGVQ5h
f5ZnKoOR5c0DptlehXw287LbdBIOL2x++KoalqfdaqtVmQ1sKmnf304VGOUBVAIn
pCDEE6FBslUxvQnvI5D+Zt4am2/wUMIKBm3huGD1iqGkN+2yk08+uif7IHEu1HOC
shMXaPkxf3bD9rMGbrFfWbo0Z4TNMLpAW3mU6/tCt6buCrObLuZ4mZ/QR1nKm14c
fSLKZYiGPPeG8nvVQI2KtrfBH4ngjLfoUum46E/DyCfzOlNzpkbY4GEA7aMhHWM4
iwIDAQAB
-----END PUBLIC KEY-----`;

function pemToBinary(pem: string): ArrayBuffer {
    const b64 = pem.replace(/-----.*?-----/g, '').replace(/\s+/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export interface EncryptedPayload {
    enc_key: string;    // RSA-OAEP encrypted AES-256 key
    iv: string;         // AES-GCM IV (12 bytes)
    ciphertext: string; // AES-GCM Encrypted JSON Body
}

/**
 * Encrypts an object payload to send to the FastAPI Backend using E2EE
 */
export async function encryptE2EERequest(payloadStr: string): Promise<EncryptedPayload> {
    // 1. Generate one-time symmetric AES-GCM 256-bit key
    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    
    // 2. Encrypt the JSON payload with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(payloadStr)
    );
    
    // 3. Encrypt the AES Key with the FastAPI Public RSA Key
    const rsaKeyData = pemToBinary(PUBLIC_KEY_PEM);
    const rsaKey = await crypto.subtle.importKey(
        "spki",
        rsaKeyData,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
    
    const encKeyBuf = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        rsaKey,
        rawAesKey
    );
    
    return {
        enc_key: arrayBufferToBase64(encKeyBuf),
        iv: arrayBufferToBase64(iv.buffer),
        ciphertext: arrayBufferToBase64(ciphertextBuf)
    };
}

const HMAC_SECRET = process.env.API_SECRET || "SUPER_SECRET_HMAC_KEY_12345";

/**
 * Calculates a SHA-256 HMAC Signature for outgoing backend requests.
 * Format: HMAC-SHA256(Secret, Timestamp + ":" + Body)
 */
export async function generateHmacHeaders(bodyStr: string = ""): Promise<{ "X-BB-Signature": string; "X-BB-Timestamp": string }> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${timestamp}:${bodyStr}`;
    
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(HMAC_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
        "X-BB-Signature": hexHash,
        "X-BB-Timestamp": timestamp
    };
}
