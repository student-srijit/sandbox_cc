import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const cStore = cookies();
    const sessionCookie = cStore.get("bb-session-id");
    const sessionId = sessionCookie?.value || "BB-APIDOCS-" + Date.now();

    // Severity → threat score mapping
    const severityScore: Record<string, number> = {
      PROBE: 72, // Visited /api-docs at all = already suspicious
      HIGH: 88, // Focused token input / hovered admin endpoints
      EXPLOIT: 100, // Actually tried to execute an admin endpoint
    };

    const threatScore = severityScore[body.severity] ?? 80;

    // Build a fake JSON-RPC payload so the honeypot engine logs this correctly
    const rpcPayload = {
      jsonrpc: "2.0",
      method: "eth_apidocsProbe",
      params: [
        { action: body.action, path: body.path, params: body.params ?? {} },
      ],
      id: Date.now(),
    };

    const res = await fetchFastAPI(`/api/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-Threat-Score": String(threatScore),
        "X-BB-Tier": body.severity === "EXPLOIT" ? "EXPLOIT" : "BOT",
        "X-BB-Session": sessionId,
        "User-Agent": req.headers.get("user-agent") || "Unknown",
        // Tag it specifically so the classifier knows this came from /api-docs
        "X-BB-Source": "APIDOCS_LURE",
      },
      body: JSON.stringify(rpcPayload),
      signal: AbortSignal.timeout(4000),
    });

    // Force immediate flush to SQLite so it appears on dashboard
    if (body.severity === "EXPLOIT") {
      fetchFastAPI(`/api/flush`, { method: "POST" }).catch(() => {});
    }

    if (!res.ok) {
      // Don't expose errors to probe — always return 200
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
