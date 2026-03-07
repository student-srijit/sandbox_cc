import { NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const apiRes = await fetch(`${FASTAPI_URL}/api/ledger`, {
      method: "GET",
      cache: "no-store",
    });

    if (!apiRes.ok) {
      console.error(
        "FastAPI returned error status for public ledger:",
        apiRes.status,
      );
      return NextResponse.json(
        { error: "Failed to fetch ledger" },
        { status: apiRes.status },
      );
    }

    const data = await apiRes.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to proxy ledger request:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
