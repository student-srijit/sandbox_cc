import { NextResponse, NextRequest } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Decoy threats endpoint.
 * POST: Receives attacker fingerprint from the fake /dashboard page,
 *       forwards it to the backend for audit logging, returns 200.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Fire-and-forget: forward fingerprint to backend audit log
    fetch(`${FASTAPI_URL}/api/decoy/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch {
    // Fingerprinting is best-effort — never reject the decoy page load
  }

  return NextResponse.json({ status: "ok" });
}
