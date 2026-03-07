import { NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const sessionId = "BB-VAULT-" + Date.now();

    // This is a specialized API route specifically for the Vault frontend.
    // When an attacker clicks a hidden "Admin" button or tries to exploit the DeFi UI,
    // we instantly forward the payload to the backend with a max Threat Score.
    const rpcPayload = {
      jsonrpc: "2.0",
      method: "eth_defiExploitAttempt",
      params: [payload],
      id: Date.now(),
    };

    // We bypass the Next.js middleware and funnel directly into the Python RPC engine
    // ensuring the attacker is instantly flagged as completely hostile.
    const res = await fetch(`${FASTAPI_URL}/api/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-Threat-Score": "100", // Max threat automatically for hitting an admin endpoint
        "X-BB-Tier": "EXPLOIT",
        "X-BB-Session": sessionId,
        "User-Agent": req.headers.get("user-agent") || "Unknown React Client",
      },
      body: JSON.stringify(rpcPayload),
    });

    // Force flush to SQLite immediately since the vault interaction is usually brief
    // compared to a 30-minute scraping script
    await fetch(`${FASTAPI_URL}/api/flush`, { method: "POST" });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to log trap" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Transaction reverted by Smart Contract.",
    });
  } catch (err) {
    console.error("Vault trap error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
