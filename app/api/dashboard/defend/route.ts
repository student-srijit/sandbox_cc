import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json();

    const apiRes = await fetch(`${FASTAPI_URL}/api/dashboard/defend`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
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
    const body = await req.json();

    const apiRes = await fetch(`${FASTAPI_URL}/api/containment/release`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
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
