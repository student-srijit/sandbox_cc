import { NextResponse, NextRequest } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Server-side token cache — so the public homepage can still fetch real threat data
// without requiring the user to be logged in.
let cachedServerToken: string | null = null;
let cachedServerCookie: string | null = null;
let tokenExpiry = 0;

type ThreatStats = {
  total: number;
  bots: number;
  suspicious: number;
  taxonomy?: unknown[];
  mutations_total?: number;
};

type ContainmentStatus = {
  active_count: number;
  critical_incident: boolean;
  critical_threat_id: string | null;
  containments: Array<{
    ip: string;
    mode: string;
    threat_id: string | null;
    age_seconds: number;
  }>;
};

type DashboardResponse = {
  logs?: unknown[];
  stats?: {
    total?: number;
    taxonomy?: unknown[];
    mutations_total?: number;
    bots?: number;
    suspicious?: number;
  };
  containment?: ContainmentStatus;
};

async function getServerToken(): Promise<string | null> {
  if (cachedServerToken && Date.now() < tokenExpiry) return cachedServerToken;

  // Preferred: service account (bypasses TOTP — for internal server-to-server calls)
  const serviceKey = process.env.BACKEND_SERVICE_KEY;
  if (serviceKey) {
    try {
      const res = await fetchFastAPI(`/api/auth/service-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_key: serviceKey }),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      cachedServerToken = data.token ?? null;
      // Service tokens expire at 30 min — refresh 2 min early
      tokenExpiry = Date.now() + 28 * 60 * 1000;
      return cachedServerToken;
    } catch {
      return null;
    }
  }

  // Legacy fallback: password login (works only when TOTP is disabled)
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  if (!adminUser || !adminPass) {
    return null;
  }

  try {
    const res = await fetchFastAPI(`/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: adminUser,
        password: adminPass,
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    cachedServerToken = data.token ?? null;
    
    // Parse the HttpOnly Cookie Set by FastAPI
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/bb_csrf_token=([^;]+)/);
      if (match) {
        cachedServerCookie = match[1];
      }
    }
    
    // Refresh 30 min before the 8-hour expiry
    tokenExpiry = Date.now() + 7.5 * 60 * 60 * 1000;
    return cachedServerToken;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const stats: ThreatStats = {
      total: 0,
      bots: 0,
      suspicious: 0,
      taxonomy: [],
      mutations_total: 0,
    };
    let degraded = false;

    // Prefer the user's own token; fall back to auto server token
    const userHeader = request.headers.get("authorization");
    const serverToken = userHeader ? null : await getServerToken();
    const authHeader =
      userHeader ?? (serverToken ? `Bearer ${serverToken}` : null);
    const fetchHeaders: Record<string, string> = authHeader
      ? { Authorization: authHeader }
      : {};
      
    // Handle Double-Submit CSRF appending
    if (userHeader) {
      const userCookie = request.cookies.get("bb_csrf_token");
      if (userCookie) {
        fetchHeaders["Cookie"] = `bb_csrf_token=${userCookie.value}`;
      }
    } else if (cachedServerCookie) {
      fetchHeaders["Cookie"] = `bb_csrf_token=${cachedServerCookie}`;
    }

    let logs: unknown[] = [];
    let containment: ContainmentStatus | null = null;

    // If we have no user token and no configured server token, do not call
    // the protected backend endpoint in a loop. Return a clean degraded snapshot.
    if (!authHeader) {
      return NextResponse.json({
        logs,
        stats,
        containment,
        status: "degraded",
        reason: "missing_admin_service_credentials",
        generatedAt: new Date().toISOString(),
      });
    }

    try {
      const apiRes = await fetchFastAPI(`/api/dashboard`, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(1500),
      });
      if (apiRes.ok) {
        const data: DashboardResponse & { error?: unknown } =
          await apiRes.json();
        // Detect JSON-RPC-style 200+error body (backend auth failure fallback)
        if (data && typeof data === "object" && "error" in data) {
          if (userHeader) {
            return NextResponse.json(
              { error: "Unauthorized" },
              { status: 401 },
            );
          }
          degraded = true;
        } else {
          logs = Array.isArray(data.logs) ? data.logs : [];
          if (data.stats) {
            stats.total =
              typeof data.stats.total === "number" ? data.stats.total : 0;
            stats.taxonomy = Array.isArray(data.stats.taxonomy)
              ? data.stats.taxonomy
              : [];
            stats.mutations_total =
              typeof data.stats.mutations_total === "number"
                ? data.stats.mutations_total
                : 0;
            stats.bots =
              typeof data.stats.bots === "number"
                ? data.stats.bots
                : stats.bots;
            stats.suspicious =
              typeof data.stats.suspicious === "number"
                ? data.stats.suspicious
                : stats.suspicious;
          }
          if (data.containment) {
            containment = data.containment;
          }
        }
      } else if (apiRes.status === 401 && userHeader) {
        // User's own token was rejected by FastAPI — propagate 401 so the
        // client can clear the stale token and redirect to login.
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      } else {
        degraded = true;
      }
    } catch (backendErr) {
      console.error("FastAPI Backend unreachable:", backendErr);
      degraded = true;
    }

    return NextResponse.json({
      logs,
      stats,
      containment,
      status: degraded ? "degraded" : "ok",
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      logs: [],
      stats: { total: 0, bots: 0, suspicious: 0 },
      status: "degraded",
      generatedAt: new Date().toISOString(),
    });
  }
}
