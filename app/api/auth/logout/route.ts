import { NextResponse, NextRequest } from "next/server";
import { fetchFastAPI } from "@/lib/backend-config";

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get("Authorization") ?? "";
    const apiRes = await fetchFastAPI("/api/auth/logout", {
      method: "POST",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
    });
    const data = await apiRes.json().catch(() => ({ status: "ok" }));
    return NextResponse.json(data, { status: apiRes.ok ? 200 : apiRes.status });
  } catch {
    // Logout is best-effort on the frontend side; always succeed locally
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
