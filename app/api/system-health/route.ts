import { NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RpcProbe = {
  ok: boolean;
  latencyMs: number | null;
  blockNumber: number | null;
};

async function probeBackend(): Promise<{
  ok: boolean;
  latencyMs: number | null;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${FASTAPI_URL}/api/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function probePublicStats(): Promise<{ activeSessions: number | null }> {
  try {
    const res = await fetch(`${FASTAPI_URL}/api/dashboard/public-stats`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { activeSessions: null };
    const data = await res.json();
    return {
      activeSessions:
        typeof data.active_sessions === "number" ? data.active_sessions : null,
    };
  } catch {
    return { activeSessions: null };
  }
}

async function probeRpc(url: string): Promise<RpcProbe> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
      signal: AbortSignal.timeout(2500),
    });

    if (!res.ok) {
      return { ok: false, latencyMs: Date.now() - start, blockNumber: null };
    }

    const payload = await res.json();
    const blockHex = payload?.result;
    const blockNumber =
      typeof blockHex === "string" ? parseInt(blockHex, 16) : NaN;

    return {
      ok: Number.isFinite(blockNumber),
      latencyMs: Date.now() - start,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : null,
    };
  } catch {
    return { ok: false, latencyMs: null, blockNumber: null };
  }
}

export async function GET() {
  const [backend, publicStats, sepoliaRpc, celoRpc] = await Promise.all([
    probeBackend(),
    probePublicStats(),
    probeRpc(process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org"),
    probeRpc(
      process.env.CELO_SEPOLIA_RPC_URL ||
        process.env.CELO_ALFAJORES_RPC_URL ||
        "https://forno.celo-sepolia.celo-testnet.org",
    ),
  ]);

  const heapUsedMb = Number(
    (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
  );

  const status = backend.ok && sepoliaRpc.ok && celoRpc.ok ? "ok" : "degraded";

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    metrics: {
      backendLatencyMs: backend.latencyMs,
      activeSessions: publicStats.activeSessions,
      nodeHeapUsedMb: heapUsedMb,
      sepoliaRpcLatencyMs: sepoliaRpc.latencyMs,
      sepoliaBlockNumber: sepoliaRpc.blockNumber,
      celoRpcLatencyMs: celoRpc.latencyMs,
      celoBlockNumber: celoRpc.blockNumber,
    },
  });
}
