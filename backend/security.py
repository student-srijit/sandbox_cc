import base64
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PRIVATE_KEY_PEM = b"""-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCVOcRt9Qd3tL2d
k0d1XDuE8ydU8WLOVcl2398cm4uechy4tM9uhzmUhZI3RcSQXna2YxAqzWml/bR2
RYZVDmF/lmcqg5HlzQOm2V6FfDbzstt0Eg4vbH74qhqWp91qq1WZDWwqad/fThUY
5QFUAiekIMQToUGyVTG9Ce8jkP5m3hqbb/BQwgoGbeG4YPWKoaQ37bKTTz66J/sg
cS7Uc4KyExdo+TF/dsP2swZusV9ZujRnhM0wukBbeZTr+0K3pu4Ks5su5niZn9BH
WcqbXhx9IspliIY894bye9VAjYq2t8EfieCMt+hS6bjoT8PIJ/M6U3OmRtjgYQDt
oyEdYziLAgMBAAECggEAKfQAto0x2US2Hmv+pg8VKK6XuzjV936E0mfkOQ299gDM
9FzZCJD57jiTP/jcZ143b9VwASiY8DLgnnOzbYxKeu1U+c3doca+pRTtjwe6B0+c
hQhidpDBLbXdHcf55vhea1Yrt8zmRMiWA9a2ReEJNgqENaSbbMCo6CW31r731wFi
OsegSi4VVTCR2dtpu/L/vuFeaqqUDw0iK4UtnvQ+RSOUavV1mzToxAWAZIGK/U5C
X/ptCPJtdwAUqqs4dIZ4Uzg7MadwIcSEGkohsqwYxu/JkZhXDz2X0L7WaEeCjXEL
922or9p0FxIbba5LHEFGkRQWvlC7Owj3B39WOZCYoQKBgQDRxORtj4gWquR6GpBy
dD5Nxf4LONnGbASD0kXEWhUIC93xHrYVm6lFctZBAubJXMnk0MZW409W4vYi4ht9
X6Ypr/mgiLaxjqvekUVdu36Nzbc/qXoHN5/rk4t8ELvm/lAoLycWqHHpVRqkLfoK
wDV8ZqewppxqDALX9a10UcCW2wKBgQC2HQg1vfvdRqQqEsINzUC7RtW5HA9rzj11
fXJUbRaPTffFdEQS3QBVVXAySCA8jau4RzBTGnKIv126OOS+RnEaeYk3/lYZwHwt
o7VckMNDOb4YExrWyEEgGNyMDTzLLjDrD5HRnBdeNvsMj6DILpTZBqApnYnfDlTg
ufV032/cEQKBgFR7MWwWdD580MuES0xtGHKGHMw0NzC8bA0S8Fol1XaKIPZs4fRN
3pxDpZpFKuFJ512p31c68McTXQGrglq53NfJMYW/yaQ0y281nnQjgNJnWTfgb27c
riFYKMLskmBzZ6DnbJypdkb8qWAZzCvsQR460apJT5E+CR8kqJjCHAglAoGALKIE
5xb+6YZsqZsbUEKjwMJlkw6bgPJ1AZyTLrnls42KUiximrTrZf6gltIyhGS8V1er
MlLjCzzLfd5/wVqGUdTDmqOM+pbAWHcs9djM4mb+fewAwe8mdvVg6Do+UhWqC5Iv
TM4StBaJhNSWtTklZeNH0as4pSBgEQvCarhwM+ECgYA9orulPPGmAarCr4AGCioD
47WhmukO/iPeRkQ/F9xqxJsUJlhr57rofEMXx5yRF+nTTwWhEcdkxpM6ONkF/IhN
JBohhNa4+ld04JtbhOZ82/Y4Kd6hiz/9tFDNBv0kepmqN8Y7kmoT2dDz0+gsHAZC
k+nygEoX1ah9i5/zJbHC8g==
-----END PRIVATE KEY-----"""

_private_key = None

def get_private_key():
    global _private_key
    if _private_key is None:
        _private_key = serialization.load_pem_private_key(PRIVATE_KEY_PEM, password=None)
    return _private_key


def decrypt_e2ee_payload(enc_key_b64: str, iv_b64: str, ciphertext_b64: str) -> str:
    """
    Decrypts an incoming Request Payload that was hybrid-encrypted by the NextJS edge.
    Raises ValueError if decryption fails or is maliciously tampered with.
    """
    try:
        # Decrypt AES key via RSA-OAEP
        enc_key = base64.b64decode(enc_key_b64)
        aes_key = get_private_key().decrypt(
            enc_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Decrypt payload payload via AES-GCM
        iv = base64.b64decode(iv_b64)
        ciphertext = base64.b64decode(ciphertext_b64)
        
        aesgcm = AESGCM(aes_key)
        raw_payload_bytes = aesgcm.decrypt(iv, ciphertext, None)
        return raw_payload_bytes.decode('utf-8')
    except Exception as e:
        raise ValueError(f"E2EE Decryption Failed: {e}")

import hmac
import hashlib
import time
import os
from fastapi import Request, HTTPException

API_SECRET = os.getenv("API_SECRET", "SUPER_SECRET_HMAC_KEY_12345")

async def verify_hmac_signature(request: Request):
    """
    Zero-Trust HMAC Signature Verifier for edge API communications.
    Enforces time-bound limits to prevent Replay Attacks and validates 
    the SHA-256 integrity of the payload.
    """
    timestamp = request.headers.get("X-BB-Timestamp")
    signature = request.headers.get("X-BB-Signature")
    
    if not timestamp or not signature:
        raise HTTPException(status_code=403, detail="Missing HMAC Signature (Zero-Trust Required)")
        
    try:
        ts_int = int(timestamp)
        now = int(time.time())
        if abs(now - ts_int) > 30:
            raise HTTPException(status_code=403, detail="HMAC Timestamp Expired (Possible Replay Attack)")
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid HMAC Timestamp format")
        
    body = await request.body()
    body_str = body.decode('utf-8') if body else ""
    
    payload = f"{timestamp}:{body_str}"
    
    expected = hmac.new(
        API_SECRET.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # We use compare_digest to prevent advanced timing side-channel attacks
    if not hmac.compare_digest(expected, signature):
        print(f"[HMAC-FAIL] Expected: {expected} | Got: {signature}")
        raise HTTPException(status_code=403, detail="Invalid HMAC Signature")
