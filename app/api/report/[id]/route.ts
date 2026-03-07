import { NextRequest, NextResponse } from "next/server";
import { FASTAPI_URL, fetchFastAPI } from "@/lib/backend-config";

const THREAT_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const threatId = params.id;
    const authHeader = request.headers.get("authorization") || "";
    const csrfCookie = request.cookies.get("bb_csrf_token");

    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!THREAT_ID_REGEX.test(threatId)) {
      return NextResponse.json({ error: "Invalid threat id" }, { status: 400 });
    }
    
    const headers: Record<string, string> = { Authorization: authHeader };
    if (csrfCookie) {
      headers["Cookie"] = `bb_csrf_token=${csrfCookie.value}`;
    }

    const apiRes = await fetchFastAPI(`/api/report/${threatId}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!apiRes.ok) {
      console.error(
        "FastAPI returned error status for PDF generation:",
        apiRes.status,
      );
      return NextResponse.json(
        { error: "Failed to generate report" },
        { status: apiRes.status },
      );
    }

    // Return the raw PDF stream wrapped in a standard NextResponse
    return new NextResponse(apiRes.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=Threat_Intel_Report_${threatId}.pdf`,
      },
    });
  } catch (err) {
    console.error("Failed to proxy PDF report download:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
