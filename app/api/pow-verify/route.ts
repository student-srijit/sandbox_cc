import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { consumePowChallenge } from "@/lib/pow-store";

/**
 * Proof of Work Verifier
 *
 * Checks if the client successfully spent CPU cycles to solve the SHA-256 challenge.
 */
export async function POST(request: NextRequest) {
  try {
    const { challenge, nonce, difficulty } = await request.json();

    if (!challenge || nonce === undefined || !difficulty) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 },
      );
    }

    const record = consumePowChallenge(String(challenge));
    if (!record) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Challenge expired, already used, or unknown. Request a new challenge.",
        },
        { status: 401 },
      );
    }

    if (record.difficulty !== Number(difficulty)) {
      return NextResponse.json(
        {
          success: false,
          error: "Challenge difficulty mismatch.",
        },
        { status: 401 },
      );
    }

    // Hash the combination
    const hashData = `${challenge}${nonce}`;
    const hash = crypto.createHash("sha256").update(hashData).digest("hex");

    // Verify the prefix constraint (e.g. "0000")
    const targetPrefix = "0".repeat(difficulty);

    if (hash.startsWith(targetPrefix)) {
      // Legitimate effort expended.
      // Upgrade their threat score cookie to HUMAN
      const response = NextResponse.json({
        success: true,
        message: "Proof of work accepted. Upgrading clearance.",
      });

      response.cookies.set({
        name: "bb-threat-score",
        value: JSON.stringify({ score: 20, tier: "HUMAN", verifiedPow: true }),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return response;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid nonce. Hash does not meet difficulty target.",
        },
        { status: 401 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Internal verification error" },
      { status: 500 },
    );
  }
}
