import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

const THREAT_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get("authorization");
  const csrfCookie = request.cookies.get("bb_csrf_token");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!THREAT_ID_REGEX.test(params.id)) {
    return NextResponse.json({ error: "Invalid threat id" }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = { Authorization: authHeader };
    if (csrfCookie) {
      headers["Cookie"] = `bb_csrf_token=${csrfCookie.value}`;
    }

    const res = await fetchFastAPI(`/api/replay/${params.id}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Not found" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
