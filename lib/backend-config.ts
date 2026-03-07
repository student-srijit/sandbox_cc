const DEFAULT_FASTAPI_URL = "http://127.0.0.1:8000";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  const parsed = new URL(trimmed);
  return parsed.origin;
}

export function getFastApiUrl(): string {
  const configured = process.env.FASTAPI_URL;
  if (!configured) {
    return DEFAULT_FASTAPI_URL;
  }

  try {
    return normalizeBaseUrl(configured);
  } catch {
    throw new Error(`Invalid FASTAPI_URL: ${configured}`);
  }
}

export const FASTAPI_URL = getFastApiUrl();
