import hmac
import hashlib
import base64
import json
import time
import os
import secrets

# Use env var or default for demo
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-bhool-bhulaiyaa-key-2026")

# Default admin credentials
ADMIN_USER = os.getenv("ADMIN_USER", "bhool")

def b64url_encode(data: bytes) -> str:
    """Base64Url encoding without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode('utf-8')

def b64url_decode(data: str) -> bytes:
    """Base64Url decoding with padding correction."""
    padding = b"=" * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data.encode('utf-8') + padding)

def create_access_token(data: dict, expires_delta_seconds: int = 8 * 3600) -> str:
    """Creates a signed JWT (HS256) using only standard libraries."""
    header = {"alg": "HS256", "typ": "JWT"}
    
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_delta_seconds
    
    header_b64 = b64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = b64url_encode(json.dumps(payload).encode('utf-8'))
    
    signature_msg = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), signature_msg, hashlib.sha256).digest()
    signature_b64 = b64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def verify_token(token: str) -> dict:
    """Verifies the JWT and returns the payload. Raises Exception if invalid or expired."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")
            
        header_b64, payload_b64, signature_b64 = parts
        
        # Verify signature
        signature_msg = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_signature = hmac.new(SECRET_KEY.encode('utf-8'), signature_msg, hashlib.sha256).digest()
        if not hmac.compare_digest(b64url_encode(expected_signature), signature_b64):
            raise ValueError("Invalid signature")
            
        payload = json.loads(b64url_decode(payload_b64).decode('utf-8'))
        
        # Verify expiration
        if 'exp' in payload and int(time.time()) > payload['exp']:
            raise ValueError("Token expired")
            
        return payload
    except Exception as e:
        raise ValueError(f"Could not validate credentials: {e}")

def get_password_hash(password: str, salt: bytes = None) -> str:
    """Hashes a password using PBKDF2-HMAC-SHA256."""
    if salt is None:
        salt = secrets.token_bytes(16)
    
    hash_bytes = hashlib.pbkdf2_hmac(
        'sha256', 
        password.encode('utf-8'), 
        salt, 
        100000 # 100k iterations
    )
    return f"{base64.b64encode(salt).decode('utf-8')}${base64.b64encode(hash_bytes).decode('utf-8')}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a password against a PBKDF2 hash string."""
    try:
        salt_b64, hash_b64 = hashed_password.split("$")
        salt = base64.b64decode(salt_b64)
        expected_hash = base64.b64decode(hash_b64)
        
        computed_hash = hashlib.pbkdf2_hmac(
            'sha256', 
            plain_password.encode('utf-8'), 
            salt, 
            100000
        )
        return hmac.compare_digest(expected_hash, computed_hash)
    except Exception:
        return False

# Generate the default password hash at module load if not in env
# Default password: "bhulaiyaa2026"
DEFAULT_HASH = get_password_hash("bhulaiyaa2026")
ADMIN_PASS_HASH = os.getenv("ADMIN_PASS_HASH", DEFAULT_HASH)
