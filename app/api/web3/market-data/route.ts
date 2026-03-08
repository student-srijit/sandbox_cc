import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,celo&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";

const SEPOLIA_RPC = "https://rpc.sepolia.org";
const CELO_SEPOLIA_RPC = "https://forno.celo-sepolia.celo-testnet.org";

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(4000),
  });
  const data = await res.json();
  return data.result as string;
}

export async function GET() {
  const [pricesResult, sepoliaGasResult, sepoliaBlockResult, celoBlockResult] =
    await Promise.allSettled([
      fetch(COINGECKO, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/json" },
      }).then((r) => r.json()),
      rpcCall(SEPOLIA_RPC, "eth_gasPrice"),
      rpcCall(SEPOLIA_RPC, "eth_blockNumber"),
      rpcCall(CELO_SEPOLIA_RPC, "eth_blockNumber"),
    ]);

  const prices =
    pricesResult.status === "fulfilled" ? pricesResult.value : null;

  const sepoliaGasWei =
    sepoliaGasResult.status === "fulfilled"
      ? parseInt(sepoliaGasResult.value ?? "0x2faf080", 16)
      : 50000000000;

  const sepoliaBlock =
    sepoliaBlockResult.status === "fulfilled"
      ? parseInt(sepoliaBlockResult.value ?? "0x786000", 16)
      : 7888000;

  const celoBlock =
    celoBlockResult.status === "fulfilled"
      ? parseInt(celoBlockResult.value ?? "0x400000", 16)
      : 4194304;

  const sepoliaGwei = Math.round((sepoliaGasWei / 1e9) * 100) / 100;

  return NextResponse.json({
    eth: {
      price: prices?.ethereum?.usd ?? 3241.5,
      change24h: prices?.ethereum?.usd_24h_change ?? 2.3,
      vol24h: prices?.ethereum?.usd_24h_vol ?? 14500000000,
      marketCap: prices?.ethereum?.usd_market_cap ?? 389000000000,
    },
    celo: {
      price: prices?.celo?.usd ?? 0.47,
      change24h: prices?.celo?.usd_24h_change ?? -0.8,
    },
    sepolia: {
      gasGwei: sepoliaGwei,
      priorityGwei: Math.round(sepoliaGwei * 0.12 * 100) / 100,
      blockNumber: sepoliaBlock,
    },
    celo_sepolia: {
      blockNumber: celoBlock,
    },
    updatedAt: Date.now(),
  });
}
