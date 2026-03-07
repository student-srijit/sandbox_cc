"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { encryptE2EERequest } from "@/lib/security";

interface ThreatEntry {
  id: number | string;
  type: string;
  css: string;
  border: string;
  from: string;
  to: string;
  time: string;
  detail: string;
  toolchain: string;
}

interface ThreatApiLog {
  threat_id: string;
  network?: {
    tier?: string;
    threat_score?: number;
    entry_ip?: string;
  };
  timeline?: {
    last_active?: string;
  };
  classification?: {
    attack_type?: string;
    inferred_toolchain?: string;
    trigger_reason?: string;
    attack_technique_id?: string;
    attack_tactic?: string;
  };
}

interface ThreatsApiResponse {
  logs?: ThreatApiLog[];
}

const MAX = 25;

function formatThreatLogs(
  logs: ThreatApiLog[],
  knownIds: Set<string>,
): ThreatEntry[] {
  const nonHuman = logs.filter((log) => log.network?.tier !== "HUMAN");
  const fresh = nonHuman.filter((log) => {
    if (!log.threat_id) return false;
    if (knownIds.has(log.threat_id)) return false;
    knownIds.add(log.threat_id);
    return true;
  });

  return fresh.map((log) => {
    const date = new Date(log.timeline?.last_active || Date.now());
    const tier = log.network?.tier || "UNKNOWN";
    const score = log.network?.threat_score || 0;
    const ip = log.network?.entry_ip || "UNKNOWN";
    const attackType = log.classification?.attack_type || "UNKNOWN_ATTACK";
    const technique = log.classification?.attack_technique_id || "";
    const tactic = log.classification?.attack_tactic || "";
    const reason = log.classification?.trigger_reason || "No SOC reason available";
    const toolchain = log.classification?.inferred_toolchain || "Unknown tooling";

    return {
      id: log.threat_id,
      type: `[${tier}] ${attackType} (SCORE: ${score})`,
      css: tier === "BOT" ? "text-[#FF003C]" : "text-[#FFD700]",
      border: tier === "BOT" ? "#FF003C" : "#FFD700",
      from: ip,
      to: "HONEYPOT.ROUTER",
      time: date.toLocaleTimeString("en-GB", { hour12: false }),
      detail: `${technique}${tactic ? ` · ${tactic}` : ""} ${reason}`.trim(),
      toolchain,
    };
  });
}

export default function ThreatFeed() {
  const [entries, setEntries] = useState<ThreatEntry[]>([]);
  const [blocked, setBlocked] = useState(0);
  const [counterPop, setCounterPop] = useState(false);

  const knownLiveIds = useRef(new Set<string>());
  const { token } = useAuth();

  useEffect(() => {
    // Stream first for true realtime feed, poll as fallback if stream drops.
    setEntries([]);
    setBlocked(0);
    knownLiveIds.current.clear();

    let pollId: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    async function pollThreats() {
      try {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/threats", { headers });
        if (!res.ok) return;
        const data: ThreatsApiResponse = await res.json();
        const formatted = formatThreatLogs(
          Array.isArray(data.logs) ? data.logs : [],
          knownLiveIds.current,
        );
        if (formatted.length === 0) return;

        setEntries((prev) => [...formatted, ...prev].slice(0, MAX));
        setBlocked((prev) => prev + formatted.length);

        setCounterPop(true);
        setTimeout(() => setCounterPop(false), 300);
      } catch {}
    }
    function ensurePolling() {
      if (pollId) return;
      pollId = setInterval(pollThreats, 1500);
      void pollThreats();
    }

    es = new EventSource("/api/threats/stream");
    es.addEventListener("threats", (event) => {
      try {
        const parsed = JSON.parse(
          (event as MessageEvent).data,
        ) as ThreatsApiResponse;
        const formatted = formatThreatLogs(
          Array.isArray(parsed.logs) ? parsed.logs : [],
          knownLiveIds.current,
        );
        if (formatted.length === 0) return;

        setEntries((prev) => [...formatted, ...prev].slice(0, MAX));
        setBlocked((prev) => prev + formatted.length);
        setCounterPop(true);
        setTimeout(() => setCounterPop(false), 300);
      } catch {
        // Ignore malformed payloads and keep stream alive.
      }
    });

    es.addEventListener("error", () => {
      // If stream fails (network/proxy), degrade gracefully to polling.
      ensurePolling();
    });

    // Prime immediately so first paint is not empty while stream handshakes.
    void pollThreats();

    return () => {
      if (pollId) clearInterval(pollId);
      if (es) es.close();
    };
  }, [token]);

  return (
    <aside
      className="threat-feed-panel flex flex-col overflow-hidden"
      aria-label="Live Threat Feed"
    >
      {/* Radar scanline sweep */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        aria-hidden="true"
      >
        <div className="feed-scanline" />
      </div>

      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3.5 flex-shrink-0 relative z-10"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
      >
        <div className="feed-dot" />
        <span
          className="text-[8.5px] tracking-[0.25em] uppercase font-semibold"
          style={{ color: "var(--text-dim)" }}
        >
          Live Threat Feed
        </span>
        <span
          className={`ml-auto text-[9px] font-bold transition-transform duration-200 ${
            counterPop ? "scale-[1.3]" : "scale-100"
          }`}
          style={{
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {blocked} Blocked
        </span>
      </div>

      {/* Feed entries */}
      <div className="flex-1 overflow-hidden relative z-10">
        <div className="flex flex-col">
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-40">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span
                className="text-[7px] tracking-[0.25em] uppercase font-mono"
                style={{ color: "var(--text-dim)" }}
              >
                Monitoring...
              </span>
            </div>
          )}
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className="feed-entry px-3.5 py-2 relative"
              style={{
                borderLeft: `3px solid ${entry.border}`,
                opacity: Math.pow(0.95, idx), // 95% cascade
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-[8px] tracking-[0.1em] uppercase font-bold ${entry.css}`}
                >
                  {entry.type}
                </span>
                <span
                  className="text-[6.5px]"
                  style={{
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {entry.time}
                </span>
              </div>
              {/* Address with strikethrough animation */}
              <div
                className="text-[7px] truncate mb-1 relative feed-addr-strike"
                style={{
                  color: "rgba(180,180,220,0.45)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {entry.from} → {entry.to}
              </div>

              <div
                className="text-[7px] leading-tight mb-1 line-clamp-2"
                style={{
                  color: "rgba(171,190,220,0.75)",
                  fontFamily: "var(--font-mono)",
                }}
                title={entry.detail}
              >
                {entry.detail}
              </div>

              <div
                className="text-[6.5px] uppercase tracking-[0.12em]"
                style={{ color: "rgba(120,210,255,0.72)" }}
              >
                Toolchain: {entry.toolchain}
              </div>

              {/* ACTIVE DEFENSE CONTROLS — only in authenticated (dashboard) mode */}
              {token && (
                <div className="flex items-center gap-2 mt-1 fade-in">
                  <button
                    onClick={async () => {
                      if (!token) return;
                      try {
                        const rawPayload = JSON.stringify({
                            ip_address: entry.from,
                            defense_type: "TAR_PIT",
                        });
                        const encryptedPayload = await encryptE2EERequest(rawPayload);
                          
                        await fetch("/api/dashboard/defend", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ e2ee_payload: encryptedPayload }),
                        });
                        // Optimistic UI update
                        const btn = document.getElementById(
                          `tarpit-btn-${entry.id}`,
                        );
                        if (btn) {
                          btn.innerText = "DEPLOYED";
                          btn.classList.add(
                            "bg-[#1a1a1a]",
                            "text-[#FFD700]",
                            "border-[#FFD700]",
                          );
                        }
                      } catch {}
                    }}
                    id={`tarpit-btn-${entry.id}`}
                    className="px-2 py-0.5 text-[6px] tracking-widest font-bold border border-white/20 hover:border-white hover:bg-white hover:text-black transition-colors rounded-[2px]"
                  >
                    DEPLOY TAR-PIT
                  </button>

                  <button
                    onClick={async () => {
                      if (!token) return;
                      try {
                        const rawPayload = JSON.stringify({
                            ip_address: entry.from,
                            defense_type: "POISONED_ABI",
                        });
                        const encryptedPayload = await encryptE2EERequest(rawPayload);
                        
                        await fetch("/api/dashboard/defend", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ e2ee_payload: encryptedPayload }),
                        });
                        const btn = document.getElementById(
                          `poison-btn-${entry.id}`,
                        );
                        if (btn) {
                          btn.innerText = "INJECTED";
                          btn.classList.add(
                            "bg-[#FF003C]",
                            "text-white",
                            "border-transparent",
                          );
                        }
                      } catch {}
                    }}
                    id={`poison-btn-${entry.id}`}
                    className="px-2 py-0.5 text-[6px] tracking-widest font-bold border border-[#FF003C]/30 text-[#FF003C] hover:border-[#FF003C] hover:bg-[#FF003C]/10 transition-colors rounded-[2px]"
                  >
                    INJECT POISON ABI
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 flex-shrink-0 relative z-10 shimmer"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      >
        <p
          className="text-[7px] tracking-[0.15em] uppercase text-center"
          style={{ color: "var(--text-dim)" }}
        >
          Shield integrity: <span style={{ color: "var(--cyan)" }}>100%</span>
        </p>
      </div>
    </aside>
  );
}
