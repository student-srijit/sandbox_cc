import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FASTAPI_URL } from "@/lib/backend-config";

const MAX_RPC_BODY_BYTES = Number(process.env.MAX_RPC_BODY_BYTES || 65536);
const TRUST_PROXY_HEADERS = String(process.env.TRUST_PROXY_HEADERS || "false").toLowerCase() === "true";

function getClientIp(req: NextRequest): string {
  const directIp = req.ip;
  if (directIp) {
    return directIp;
  }

  if (TRUST_PROXY_HEADERS) {
    const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
  }

  return "127.0.0.1";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (body.length > MAX_RPC_BODY_BYTES) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Request too large" },
          id: null,
        },
        { status: 413 },
      );
    }

    // 1. Extract the BB Telemetry scores from the cookies
    // We set these in the edge middleware and telemetry endpoints
    const cStore = cookies();
    const scoreCookie = cStore.get("bb-threat-score");
    const tierCookie = cStore.get("bb-threat-tier");
    const sessionCookie = cStore.get("bb-session-id");

    let parsedScore: string | null = null;
    let parsedTier: string | null = null;

    if (scoreCookie?.value) {
      try {
        const decoded = JSON.parse(scoreCookie.value);
        if (typeof decoded?.score === "number") {
          parsedScore = String(decoded.score);
        }
        if (typeof decoded?.tier === "string") {
          parsedTier = decoded.tier;
        }
      } catch {
        if (!Number.isNaN(Number(scoreCookie.value))) {
          parsedScore = scoreCookie.value;
        }
      }
    }

    // Priority: cookie -> incoming X-BB-* header (simulate attack tooling) -> default
    const threatScore =
      parsedScore || req.headers.get("x-bb-threat-score") || "0";
    const threatTier =
      tierCookie?.value ||
      parsedTier ||
      req.headers.get("x-bb-tier") ||
      "UNKNOWN";
    const sessionId =
      sessionCookie?.value || req.headers.get("x-bb-session") || "anon-session";

    // 2. Proxy the raw JSON-RPC payload to the Live Python Honeypot
    // Pass the threat intelligence down via custom headers
    const apiRes = await fetch(`${FASTAPI_URL}/api/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-Threat-Score": threatScore,
        "X-BB-Tier": threatTier,
        "X-BB-Session": sessionId,
        // Forward the attacker's User-Agent for classifier analysis
        "User-Agent": req.headers.get("user-agent") || "Unknown",
        // Forward the originating IP so FastAPI can classify by source.
        "X-Forwarded-For": getClientIp(req),
      },
      body: body,
      // 15 second timeout to allow LLaMA 3 time to generate a long response
      signal: AbortSignal.timeout(15000),
    });

    if (!apiRes.ok) {
      console.error("FastAPI returned error status:", apiRes.status);
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error checking routing" },
          id: null,
        },
        { status: 500 },
      );
    }

    const responseData = await apiRes.json();

    return NextResponse.json(responseData);
  } catch (err) {
    console.error("Failed to proxy RPC to backend:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      },
      { status: 500 },
    );
  }
}
