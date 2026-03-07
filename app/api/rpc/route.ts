import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, randomBytes } from "crypto";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

const MAX_RPC_BODY_BYTES = Number(process.env.MAX_RPC_BODY_BYTES || 65536);
const TRUST_PROXY_HEADERS = String(process.env.TRUST_PROXY_HEADERS || "false").toLowerCase() === "true";
const REQUIRE_INTERNAL_RPC_SIGNATURE = String(process.env.REQUIRE_INTERNAL_RPC_SIGNATURE || "true").toLowerCase() === "true";
const DEV_INTERNAL_RPC_SECRET = "bb-internal-rpc-dev-only-change-me";
const INTERNAL_RPC_SHARED_SECRET = String(
  process.env.INTERNAL_RPC_SHARED_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : DEV_INTERNAL_RPC_SECRET),
);

export const runtime = "nodejs";

function buildInternalRpcAuthHeaders(body: string): Record<string, string> {
  if (!REQUIRE_INTERNAL_RPC_SIGNATURE) {
    return {};
  }
  if (!INTERNAL_RPC_SHARED_SECRET) {
    throw new Error("INTERNAL_RPC_SHARED_SECRET is required when REQUIRE_INTERNAL_RPC_SIGNATURE=true");
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", INTERNAL_RPC_SHARED_SECRET)
    .update(`${timestamp}.${nonce}.${body}`, "utf8")
    .digest("hex");

  return {
    "X-BB-Timestamp": timestamp,
    "X-BB-Nonce": nonce,
    "X-BB-Signature": signature,
  };
}

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

    const internalAuthHeaders = buildInternalRpcAuthHeaders(body);

    // 2. Proxy the raw JSON-RPC payload to the Live Python Honeypot
    // Pass the threat intelligence down via custom headers
    const apiRes = await fetchFastAPI(`/api/rpc`, {
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
        ...internalAuthHeaders,
      },
      body: body,
      // 15 second timeout to allow LLaMA 3 time to generate a long response
      signal: AbortSignal.timeout(15000),
    });

    if (!apiRes.ok) {
      console.error("FastAPI returned error status:", apiRes.status);

      if (apiRes.status === 401 || apiRes.status === 403) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Unauthorized internal caller" },
            id: null,
          },
          { status: 502 },
        );
      }

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
