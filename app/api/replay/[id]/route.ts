import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

const THREAT_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!THREAT_ID_REGEX.test(params.id)) {
    return NextResponse.json({ error: "Invalid threat id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${FASTAPI_URL}/api/replay/${params.id}`, {
      headers: { Authorization: authHeader },
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
