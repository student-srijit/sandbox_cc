import { NextResponse, NextRequest } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const apiRes = await fetchFastAPI(`/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();

    const response = NextResponse.json(data, { status: apiRes.ok ? 200 : apiRes.status });
    
    // Forward the Double-Submit HttpOnly Cookie to the browser
    const setCookie = apiRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("Set-Cookie", setCookie);
    }
    
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: -32603, message: "Internal proxy error" } },
      { status: 500 },
    );
  }
}
