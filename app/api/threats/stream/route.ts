import { NextRequest } from "next/server";

type ThreatLogLike = {
  threat_id?: string;
  network?: {
    tier?: string;
  };
};

type ThreatsPayload = {
  logs?: ThreatLogLike[];
  status?: string;
  generatedAt?: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const enc = new TextEncoder();

function encodeSse(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isNonHuman(log: ThreatLogLike): boolean {
  const tier = log.network?.tier || "UNKNOWN";
  return tier !== "HUMAN";
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const knownIds = new Set<string>();

  let interval: NodeJS.Timeout | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let closed = false;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const poll = async () => {
        try {
          const res = await fetch(`${origin}/api/threats`, {
            method: "GET",
            cache: "no-store",
          });

          if (!res.ok) {
            controller.enqueue(
              encodeSse("status", {
                status: "degraded",
                code: res.status,
                at: new Date().toISOString(),
              }),
            );
            return;
          }

          const payload = (await res.json()) as ThreatsPayload;
          const logs = Array.isArray(payload.logs) ? payload.logs : [];
          const nonHuman = logs.filter(isNonHuman);
          const fresh = nonHuman.filter((log) => {
            const id = log.threat_id;
            if (!id) return false;
            if (knownIds.has(id)) return false;
            knownIds.add(id);
            return true;
          });

          if (fresh.length > 0) {
            controller.enqueue(
              encodeSse("threats", {
                logs: fresh,
                status: payload.status || "ok",
                generatedAt: payload.generatedAt || new Date().toISOString(),
              }),
            );
          }
        } catch {
          controller.enqueue(
            encodeSse("status", {
              status: "degraded",
              reason: "poll_failed",
              at: new Date().toISOString(),
            }),
          );
        }
      };

      controller.enqueue(
        encodeSse("ready", {
          connected: true,
          at: new Date().toISOString(),
        }),
      );

      void poll();
      interval = setInterval(() => {
        void poll();
      }, 1000);

      heartbeat = setInterval(() => {
        controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        closeAll();
        try {
          controller.close();
        } catch {
          // ignore double close race
        }
      });
    },
    cancel() {
      closeAll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
