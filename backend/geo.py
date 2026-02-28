import asyncio
import time
import urllib.request
import json
import urllib.error
from typing import Dict, Tuple, Optional
from pydantic import BaseModel, Field

class GeoData(BaseModel):
    """
    Geographic footprint of an attacker retrieved via http://ip-api.com
    """
    lat: float
    lon: float
    city: str = "Unknown"
    country: str = "Unknown"
    countryCode: str = "XX"
    isp: str = "Unknown ISP"
    org: str = ""
    as_name: str = Field(default="", alias="as")
    proxy: bool = False
    hosting: bool = False

# Simple in-memory LRU-style TTL cache
# Keys: IP strings -> Values: Tuple(GeoData, expiration_timestamp)
_geo_cache: Dict[str, Tuple[Optional[GeoData], float]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour 

# Mock locations for common dev/private IPs
_MOCK_LOCATIONS = {
    # Default local dev maps to mid-Atlantic Ocean to show it's working logically
    "127.0.0.1": GeoData(lat=35.0, lon=-40.0, city="Localhost", country="DevNet", proxy=False, hosting=False),
    "0.0.0.0": GeoData(lat=35.0, lon=-40.0, city="Localhost", country="DevNet", proxy=False, hosting=False),
    "::1": GeoData(lat=35.0, lon=-40.0, city="Localhost", country="DevNet", proxy=False, hosting=False),
}

for prefix in ["192.168.", "10.", "172.16.", "172.31."]:
    # We won't pre-populate the whole /8 space, but we will catch them dynamically below
    pass

async def geolocate(ip: str) -> Optional[GeoData]:
    """
    Resolves an IP to a GeoData model.
    Implements a 1 hr TTL cache and a 3-try exponential backoff for ip-api.com rate limits (45/min).
    """
    # 1. Private/Localhost Checks
    if ip in _MOCK_LOCATIONS:
        return _MOCK_LOCATIONS[ip]
    if ip.startswith("192.168.") or ip.startswith("10.") or (ip.startswith("172.") and int(ip.split(".")[1]) in range(16, 32)):
        return GeoData(lat=35.0, lon=-40.0, city="Private Subnet", country="DevNet", proxy=False, hosting=False)

    # 2. Check Cache
    now = time.time()
    if ip in _geo_cache:
        cached_data, expire_time = _geo_cache[ip]
        if now < expire_time:
            return cached_data
        else:
            del _geo_cache[ip]

    # 3. HTTP Request with Exponential Backoff
    url = f"http://ip-api.com/json/{ip}?fields=lat,lon,city,country,countryCode,isp,org,as,proxy,hosting"
    
    max_retries = 3
    base_delay = 1.0 # 1s, 2s, 4s for rate limit hits

    for attempt in range(max_retries):
        try:
            # We use to_thread to keep urllib from blocking the async event loop
            req = urllib.request.Request(url, headers={'User-Agent': 'BhoolBhulaiyaa/1.0'})
            
            def make_request():
                with urllib.request.urlopen(req, timeout=4.0) as response:
                    return response.read(), response.getcode()
                    
            body, status_code = await asyncio.to_thread(make_request)
            
            data = json.loads(body.decode('utf-8'))
            
            if data.get("status") == "fail":
                # Reserved / bogon ranges that ip-api couldn't parse
                _geo_cache[ip] = (None, now + CACHE_TTL_SECONDS)
                return None
                
            geo = GeoData(**data)
            
            # Cache successful response
            _geo_cache[ip] = (geo, now + CACHE_TTL_SECONDS)
            return geo
            
        except urllib.error.HTTPError as e:
            if e.code == 429:
                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2 ** attempt))
                    continue
            break
        except (urllib.error.URLError, ValueError, Exception) as e:
            # Network failure, timeout, or bad JSON parsing 
            print(f"[GEO] ip-api failure for {ip}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(base_delay * (2 ** attempt))
                continue
            break
            
    # Exhausted retries or failed completely
    # Cache negative result temporarily (5 minutes) so we stop hammering the broken API
    _geo_cache[ip] = (None, now + 300)
    return None
