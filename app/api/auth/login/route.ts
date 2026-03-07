import { NextResponse, NextRequest } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const apiRes = await fetch(`${FASTAPI_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();

    return NextResponse.json(data, { status: apiRes.ok ? 200 : apiRes.status });
  } catch {
    return NextResponse.json(
      { error: { code: -32603, message: "Internal proxy error" } },
      { status: 500 },
    );
  }
}
