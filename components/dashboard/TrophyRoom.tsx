"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import SessionReplay from "@/components/dashboard/SessionReplay";

interface PayloadLog {
  method: string;
  params: string;
  timestamp: string;
  decoded_intent: string;
}

interface ThreatRecord {
  threat_id: string;
  session_id: string;
  network: {
    entry_ip: string;
    user_agent: string;
    threat_score: number;
    tier: string;
  };
  classification: {
    attack_type: string;
    sophistication: string;
    inferred_toolchain: string;
    confidence: number;
  };
  timeline?: {
    time_wasted_seconds?: number;
    total_requests?: number;
  };
  payloads: PayloadLog[];
}

interface DashboardResponse {
  logs?: ThreatRecord[];
}

export default function TrophyRoom() {
  const { token } = useAuth();
  const [trophies, setTrophies] = useState<ThreatRecord[]>([]);
  const [replayId, setReplayId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    async function fetchTrophies() {
      try {
        const res = await fetch("/api/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as DashboardResponse;
          // Filter for BOT tiers
          const bots = (data.logs || []).filter(
            (log) => log.network?.tier === "BOT",
          );
          setTrophies(bots);
        }
      } catch {}
    }
    fetchTrophies();
    const id = setInterval(fetchTrophies, 2000);
    return () => clearInterval(id);
  }, [token]);

  return (
    <>
      <div className="w-full h-full bg-[#030303] overflow-y-auto p-8 border-l border-[#222]">
        <div className="flex items-center gap-4 mb-10">
          <div
            className="text-[#FFD700] text-4xl"
            style={{ textShadow: "0 0 20px rgba(255, 215, 0, 0.3)" }}
          >
            🏆
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-[0.3em] text-white">
              THE TROPHY ROOM
            </h2>
            <p className="text-[10px] tracking-widest text-[#555] uppercase mt-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700] animate-pulse glow-gold" />
              Captured Attacker Profiles & Sequence Fingerprints
            </p>
          </div>
        </div>

        {trophies.length === 0 ? (
          <div
            className="text-[#333] tracking-widest text-xs uppercase h-64 border border-[#1a1a1a] flex flex-col items-center justify-center gap-4"
            style={{
              background:
                "repeating-linear-gradient(45deg, #020202, #020202 10px, #050505 10px, #050505 20px)",
            }}
          >
            <div className="text-2xl opacity-20">🛡️</div>
            <div className="font-mono">
              Awaiting Trophies - No advanced toolchains captured yet.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trophies.map((t) => (
              <div
                key={t.threat_id}
                className="border border-[#1a1a1a] bg-black p-5 relative group hover:border-[#FFD700]/50 transition-colors shadow-2xl"
              >
                {/* Gold corner accents */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#FFD700] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#FFD700] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#FFD700] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#FFD700] opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="text-[11px] tracking-widest text-[#FFD700] mb-1 font-bold">
                      {t.classification.inferred_toolchain &&
                      t.classification.inferred_toolchain !== "Unknown Tooling"
                        ? t.classification.inferred_toolchain
                        : t.classification.attack_type ||
                          "Unclassified Attacker"}
                    </div>
                    <div className="text-xs text-white font-mono opacity-80 flex items-center gap-2">
                      <span className="text-[#555] text-[9px] uppercase tracking-widest">
                        TARGET
                      </span>
                      {t.network.entry_ip}
                    </div>
                  </div>
                  <div className="text-[9px] px-2 py-1 border border-[#FFD700]/30 text-[#FFD700] tracking-wider bg-[#FFD700]/10 shrink-0 font-bold font-mono">
                    CAP_{t.threat_id.split("-").pop()}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-[#222] pb-2">
                    <div className="text-[8px] text-[#555] tracking-widest uppercase mb-1">
                      Time Wasted in Honeypot
                    </div>
                    <div className="text-[#00FF41] text-sm font-mono font-bold tracking-widest">
                      {t.timeline?.time_wasted_seconds ?? 0}s
                    </div>
                  </div>

                  <div className="flex justify-between items-end border-b border-[#222] pb-2">
                    <div className="text-[8px] text-[#555] tracking-widest uppercase mb-1">
                      Total RPC Exploits Attempted
                    </div>
                    <div className="text-white text-sm font-mono tracking-widest">
                      [{t.timeline?.total_requests ?? 0}]
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-[8px] text-[#555] tracking-widest uppercase mb-2">
                      Fingerprint Sequence (Last 8)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.payloads.slice(-8).map((p, idx) => (
                        <span
                          key={idx}
                          className="text-[8px] font-mono px-1.5 py-0.5 bg-[#0a0a0a] text-[#00FFD1] border border-[#222]"
                        >
                          {p.method}
                        </span>
                      ))}
                      {t.payloads.length > 8 && (
                        <span className="text-[8px] font-mono px-1 py-0.5 text-[#555] bg-black">
                          +{t.payloads.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replay Button */}
                <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
                  <button
                    onClick={() => setReplayId(t.threat_id)}
                    className="w-full text-[9px] tracking-widest py-1.5 border border-[#00FFD1]/30 text-[#00FFD1] bg-[#00FFD1]/5 hover:bg-[#00FFD1]/15 transition-colors font-bold"
                  >
                    ⏵ REPLAY ATTACK SEQUENCE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session Replay Modal */}
      {replayId && (
        <SessionReplay threatId={replayId} onClose={() => setReplayId(null)} />
      )}
    </>
  );
}
