import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function parseCloudinaryUrl(urlValue: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  if (!urlValue) {
    return { cloudName: "", apiKey: "", apiSecret: "" };
  }

  // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
  const normalized = urlValue.trim();
  if (!normalized.startsWith("cloudinary://")) {
    return { cloudName: "", apiKey: "", apiSecret: "" };
  }

  try {
    const parsed = new URL(normalized);
    return {
      apiKey: decodeURIComponent(parsed.username || ""),
      apiSecret: decodeURIComponent(parsed.password || ""),
      cloudName: decodeURIComponent(parsed.hostname || ""),
    };
  } catch {
    return { cloudName: "", apiKey: "", apiSecret: "" };
  }
}

function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return createHash("sha1")
    .update(`${canonical}${apiSecret}`)
    .digest("hex");
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      folder?: string;
    };

    const parsedCloudinaryUrl = parseCloudinaryUrl(
      process.env.CLOUDINARY_URL || "",
    );
    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME || parsedCloudinaryUrl.cloudName || "";
    const apiKey = process.env.CLOUDINARY_API_KEY || parsedCloudinaryUrl.apiKey || "";
    const apiSecret =
      process.env.CLOUDINARY_API_SECRET || parsedCloudinaryUrl.apiSecret || "";

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error:
            "Cloudinary server variables missing: set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET",
        },
        { status: 500 },
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = (body.folder || "vault-bounties").trim();

    const paramsToSign = {
      folder,
      timestamp,
    };

    const signature = signCloudinaryParams(paramsToSign, apiSecret);

    return NextResponse.json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
