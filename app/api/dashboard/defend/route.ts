import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const csrfCookie = req.cookies.get("bb_csrf_token");
    const body = await req.json();
    
    const headers: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };
    if (csrfCookie) {
      headers["Cookie"] = `bb_csrf_token=${csrfCookie.value}`;
    }

    const apiRes = await fetchFastAPI(`/api/dashboard/defend`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch (err) {
    console.error("Failed to proxy /api/dashboard/defend:", err);
    return NextResponse.json(
      { error: "Defense deployment failed" },
      { status: 503 },
    );
  }
}

/** DELETE /api/dashboard/defend — releases a contained IP (analyst override). */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const csrfCookie = req.cookies.get("bb_csrf_token");
    const body = await req.json();
    
    const headers: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };
    if (csrfCookie) {
      headers["Cookie"] = `bb_csrf_token=${csrfCookie.value}`;
    }

    const apiRes = await fetchFastAPI(`/api/containment/release`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch (err) {
    console.error("Failed to proxy containment release:", err);
    return NextResponse.json({ error: "Release failed" }, { status: 503 });
  }
}
