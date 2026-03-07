import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const csrfCookie = req.cookies.get("bb_csrf_token");

    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const headers: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };
    if (csrfCookie) {
      headers["Cookie"] = `bb_csrf_token=${csrfCookie.value}`;
    }

    const apiRes = await fetchFastAPI(`/api/dashboard`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!apiRes.ok) {
      const errorPayload =
        apiRes.status === 401
          ? { error: "Unauthorized" }
          : { error: "Dashboard unavailable" };
      return NextResponse.json(errorPayload, { status: apiRes.status });
    }

    const data = await apiRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to proxy /api/dashboard:", error);
    return NextResponse.json(
      { error: "Dashboard proxy unavailable" },
      { status: 503 },
    );
  }
}
