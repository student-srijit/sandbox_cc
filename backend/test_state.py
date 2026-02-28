import asyncio
import aiohttp
import json

async def test_llm_statefulness():
    print("Beginning LLM Statefulness Verification Sequence...")
    
    headers = {
        "User-Agent": "Bot/1.0",
        "X-Forwarded-For": "1.2.3.4",
        "X-BB-Tier": "BOT",
        "X-BB-Threat-Score": "100"
    }
    
    session_id = "test-state-session"
    
    async with aiohttp.ClientSession() as session:
        # TEST 1: Block Height verification
        print("\n--- TEST 1: Block Height ---")
        payload1 = {"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}
        async with session.post("http://127.0.0.1:8000/api/rpc", json=payload1, headers=headers) as r:
            res = await r.json()
            block_hex = res.get("result", "UNKNOWN")
            block_dec = int(block_hex, 16) if block_hex != "UNKNOWN" else 0
            print(f"Block Height returned: {block_dec} ({block_hex})")
            
        # TEST 2: Initial Nonce
        print("\n--- TEST 2: Initial Nonce ---")
        payload2 = {"jsonrpc": "2.0", "method": "eth_getTransactionCount", "params": ["0xAttacker", "latest"], "id": 2}
        async with session.post("http://127.0.0.1:8000/api/rpc", json=payload2, headers=headers) as r:
            res = await r.json()
            nonce1 = res.get("result", "UNKNOWN")
            print(f"Initial Nonce returned: {nonce1}")
            
        # TEST 3: Sending a Transaction
        print("\n--- TEST 3: Submitting Transaction ---")
        payload3 = {"jsonrpc": "2.0", "method": "eth_sendRawTransaction", "params": ["0xdeadbeef1234"], "id": 3}
        async with session.post("http://127.0.0.1:8000/api/rpc", json=payload3, headers=headers) as r:
            res = await r.json()
            tx_hash = res.get("result", "UNKNOWN")
            print(f"Transaction Hash generated: {tx_hash}")
            
        # TEST 4: Verifying Nonce Incremented
        print("\n--- TEST 4: Incremented Nonce ---")
        payload4 = {"jsonrpc": "2.0", "method": "eth_getTransactionCount", "params": ["0xAttacker", "latest"], "id": 4}
        async with session.post("http://127.0.0.1:8000/api/rpc", json=payload4, headers=headers) as r:
            res = await r.json()
            nonce2 = res.get("result", "UNKNOWN")
            print(f"Post-Tx Nonce returned: {nonce2}")
            if nonce1 != nonce2:
                print("✅ Nonce successfully incremented!")
            else:
                print("❌ Nonce failed to increment.")
                
        # TEST 5: Verifying Transaction Receipt matches the preserved Tx Hash
        print(f"\n--- TEST 5: Querying Receipt for {tx_hash} ---")
        payload5 = {"jsonrpc": "2.0", "method": "eth_getTransactionReceipt", "params": [tx_hash], "id": 5}
        async with session.post("http://127.0.0.1:8000/api/rpc", json=payload5, headers=headers) as r:
            res = await r.json()
            print(f"Receipt format: {json.dumps(res, indent=2)}")

if __name__ == "__main__":
    asyncio.run(test_llm_statefulness())
