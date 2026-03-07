import { NextResponse } from "next/server";
import { FASTAPI_URL } from "@/lib/backend-config";

export async function POST() {
  try {
    const sessionId = `BB-SIM-${Date.now()}`;
    const ips = ['103.28.41.219', '185.220.101.44', '45.148.10.92', '91.132.147.55', '176.111.174.31', '3.8.14.0', '13.238.29.0'];
    const randomIp = ips[Math.floor(Math.random() * ips.length)];

    const headers = {
      "Content-Type": "application/json",
      "X-BB-Threat-Score": "100",
      "X-BB-Tier": "BOT",
      "X-BB-Session": sessionId,
      "X-Forwarded-For": randomIp,
      "User-Agent": "Mozilla/5.0 Playwright",
    };

    const sequence = [
      ["eth_chainId", []],
      ["eth_accounts", []],
      ["eth_getBalance", ["0x1", "latest"]],
      ["eth_sendTransaction", [{ from: "0x1", to: "0x2" }]],
    ];

    for (let i = 0; i < sequence.length; i += 1) {
      const [method, params] = sequence[i];
      await fetch(`${FASTAPI_URL}/api/rpc`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
          id: i + 1,
        }),
        signal: AbortSignal.timeout(4000),
      });
    }

    const loginRes = await fetch(`${FASTAPI_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || "bhool",
        password: process.env.ADMIN_PASSWORD || "bhulaiyaa2026",
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!loginRes.ok) {
      return NextResponse.json(
        { error: "Simulation completed but flush auth failed" },
        { status: 502 },
      );
    }

    const loginJson = await loginRes.json();
    const token = loginJson?.token as string | undefined;
    if (!token) {
      return NextResponse.json(
        { error: "Simulation completed but token was not issued" },
        { status: 502 },
      );
    }

    await fetch(`${FASTAPI_URL}/api/flush`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(2000),
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error("Failed to execute simulated trap sequence:", error);
    return NextResponse.json(
      { error: "Internal sequence failure" },
      { status: 500 },
    );
  }
}
