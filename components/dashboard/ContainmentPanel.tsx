"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

/* ═══════════════════════════════════════════════════════════════
   CONTAINMENT PANEL — SOC-Grade Alert Explainability + Playbooks
   Shows:
   • Why each alert was triggered (trigger_reason)
   • MITRE ATT&CK technique matched
   • Confidence level
   • Analyst containment controls (QUARANTINE / SHADOW_BAN / SINKHOLE / CRITICAL_INCIDENT)
   • Active containment status with release controls
═══════════════════════════════════════════════════════════════ */

type ContainmentEntry = {
  ip: string;
  mode: string;
  threat_id: string | null;
  age_seconds: number;
};

type ContainmentStatus = {
  active_count: number;
  critical_incident: boolean;
  critical_threat_id: string | null;
  containments: ContainmentEntry[];
};

type ThreatLog = {
  threat_id: string;
  network?: {
    entry_ip?: string;
    threat_score?: number;
    tier?: string;
  };
  classification?: {
    attack_type?: string;
    attack_technique_id?: string;
    attack_technique_name?: string;
    attack_tactic?: string;
    trigger_reason?: string;
    confidence?: number;
    inferred_toolchain?: string;
  };
  timeline?: {
    last_active?: string;
    time_wasted_seconds?: number;
  };
};

const PLAYBOOK_OPTIONS = [
  {
    mode: "QUARANTINE",
    label: "🔒 QUARANTINE",
    color: "#FF6B00",
    description: "Block all traffic — empty loop responses",
  },
  {
    mode: "SHADOW_BAN",
    label: "👻 SHADOW BAN",
    color: "#8B00FF",
    description: "Silent: serve poisoned data, attacker unaware",
  },
  {
    mode: "SINKHOLE",
    label: "🌀 SINKHOLE",
    color: "#00BFFF",
    description: "Redirect into infinite bait contract loop",
  },
  {
    mode: "CRITICAL_INCIDENT",
    label: "🚨 DECLARE CRITICAL",
    color: "#FF0000",
    description: "Escalate to war-room state (SOC alert)",
  },
  {
    mode: "TAR_PIT",
    label: "⏳ TAR PIT",
    color: "#FFB800",
    description: "Hang connection for 30s — exhausts pool",
  },
  {
    mode: "POISONED_ABI",
    label: "☣️ POISON ABI",
    color: "#FF2020",
    description: "Send recursive JSON bomb — crashes parser",
  },
];

const MODE_COLORS: Record<string, string> = {
  QUARANTINE: "#FF6B00",
  SHADOW_BAN: "#8B00FF",
  SINKHOLE: "#00BFFF",
  CRITICAL_INCIDENT: "#FF0000",
  TAR_PIT: "#FFB800",
  POISONED_ABI: "#FF2020",
};

function fmtAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? "#FF2020" : pct >= 70 ? "#FFB800" : "#00FF41";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-[4px] bg-[#111] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #FFB800, ${color})`,
          }}
        />
      </div>
      <span className="text-[8px] font-bold tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

interface AlertCardProps {
  log: ThreatLog;
  token: string;
  onContained: () => void;
}

function AlertCard({ log, token, onContained }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState<string | null>(null);

  const cls = log.classification || {};
  const net = log.network || {};
  const ip = net.entry_ip || "—";
  const attackType = cls.attack_type || "UNKNOWN";
  const techniqueId = cls.attack_technique_id || "—";
  const techniqueName = cls.attack_technique_name || "Unknown Technique";
  const tactic = cls.attack_tactic || "—";
  const confidence = typeof cls.confidence === "number" ? cls.confidence : 0;
  const triggerReason = cls.trigger_reason || "No trigger reason recorded.";
  const toolchain = cls.inferred_toolchain || "Unknown";

  const deployPlaybook = async (mode: string) => {
    setDeploying(true);
    try {
      const res = await fetch("/api/dashboard/defend", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ip_address: ip,
          defense_type: mode,
          threat_id: log.threat_id,
        }),
      });
      if (res.ok) {
        setDeployed(mode);
        onContained();
      }
    } catch {}
    setDeploying(false);
  };

  return (
    <div
      className="border border-[#1a1a1a] bg-[#050505] rounded-sm mb-2 transition-all duration-200"
      style={{ borderLeftColor: "#FF2020", borderLeftWidth: 3 }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[#0a0a0a] transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-[9px] font-bold text-[#FF2020] tracking-wider flex-shrink-0">
          {attackType}
        </span>
        <span className="text-[8px] text-[#555] font-mono flex-1 truncate">
          {ip}
        </span>
        <span className="text-[7px] text-[#444] tracking-wider flex-shrink-0">
          {techniqueId}
        </span>
        <span className="text-[8px] text-[#444] ml-1 flex-shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded explainability section */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#111]">
          {/* ATT&CK Technique */}
          <div className="mt-2 mb-2 p-2 bg-[#0a0a0a] rounded-sm border border-[#1a1a1a]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[7px] text-[#FF2020] tracking-widest uppercase font-bold">
                ATT&CK
              </span>
              <span className="text-[8px] text-[#FFB800] font-mono font-bold">
                {techniqueId}
              </span>
              <span className="text-[7px] text-[#666]">·</span>
              <span className="text-[7px] text-[#888]">{tactic}</span>
            </div>
            <p className="text-[8px] text-[#aaa] leading-relaxed">
              {techniqueName}
            </p>
          </div>

          {/* Confidence */}
          <div className="mb-2">
            <span className="text-[7px] text-[#444] tracking-widest uppercase">
              CONFIDENCE
            </span>
            <ConfidenceBar confidence={confidence} />
          </div>

          {/* Trigger Reason */}
          <div className="mb-3">
            <span className="text-[7px] text-[#444] tracking-widest uppercase block mb-1">
              WHY THIS ALERT FIRED
            </span>
            <p className="text-[7.5px] text-[#999] leading-relaxed border-l-2 border-[#1a1a1a] pl-2">
              {triggerReason}
            </p>
          </div>

          {/* Toolchain */}
          <div className="mb-3">
            <span className="text-[7px] text-[#444] tracking-widest uppercase">
              INFERRED TOOLCHAIN
            </span>
            <p className="text-[8px] text-[#FFB800] font-mono mt-0.5">
              {toolchain}
            </p>
          </div>

          {/* Containment Playbooks */}
          {deployed ? (
            <div className="text-center py-1">
              <span
                className="text-[8px] tracking-widest font-bold"
                style={{ color: MODE_COLORS[deployed] || "#00FF41" }}
              >
                ✓ {deployed} DEPLOYED
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[7px] text-[#444] tracking-widest uppercase block mb-1.5">
                CONTAINMENT PLAYBOOK
              </span>
              <div className="grid grid-cols-2 gap-1">
                {PLAYBOOK_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    disabled={deploying}
                    onClick={() => deployPlaybook(opt.mode)}
                    title={opt.description}
                    className="px-1.5 py-1 text-[6.5px] tracking-wider font-bold border rounded-sm transition-colors text-left"
                    style={{
                      borderColor: opt.color + "44",
                      color: opt.color,
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        opt.color + "22";
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        opt.color;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        opt.color + "44";
                    }}
                  >
                    {deploying ? "..." : opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ContainmentPanelProps {
  logs: ThreatLog[];
  containment: ContainmentStatus | null;
  onRefresh: () => void;
}

export default function ContainmentPanel({
  logs,
  containment,
  onRefresh,
}: ContainmentPanelProps) {
  const { token } = useAuth();
  const [releasing, setReleasing] = useState<string | null>(null);

  const releaseIp = useCallback(
    async (ip: string) => {
      if (!token) return;
      setReleasing(ip);
      try {
        await fetch("/api/dashboard/defend", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ip_address: ip }),
        });
        onRefresh();
      } catch {}
      setReleasing(null);
    },
    [token, onRefresh],
  );

  // Show all non-human threat activity (BOT + SUSPICIOUS) in the SOC panel
  const alertLogs = logs
    .filter((l) => l.network?.tier && l.network.tier !== "HUMAN")
    .slice(0, 10);

  return (
    <div className="h-full flex flex-col">
      <div className="wr-panel-header">
        <span className="wr-panel-title">SOC ALERT EXPLAINABILITY</span>
        <span className="text-[9px] text-[#FF2020]">
          {alertLogs.length} ALERTS
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Active Containments Summary */}
        {containment && containment.active_count > 0 && (
          <div className="mb-3 p-2 border border-[#FF2020]/30 bg-[#FF2020]/5 rounded-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[7px] text-[#FF2020] tracking-widest uppercase font-bold">
                ▌ ACTIVE CONTAINMENTS ({containment.active_count})
              </span>
              {containment.critical_incident && (
                <span className="text-[6.5px] bg-[#FF0000] text-white px-1.5 py-0.5 rounded-sm font-bold tracking-wider animate-pulse">
                  🚨 CRITICAL INCIDENT
                </span>
              )}
            </div>
            {containment.containments.map((c) => (
              <div key={c.ip} className="flex items-center gap-2 py-0.5">
                <span className="text-[7px] font-mono text-[#888] flex-1 truncate">
                  {c.ip}
                </span>
                <span
                  className="text-[6.5px] font-bold tracking-wider px-1 py-0.5 rounded-sm"
                  style={{
                    color: MODE_COLORS[c.mode] || "#FFF",
                    border: `1px solid ${
                      (MODE_COLORS[c.mode] || "#FFF") + "44"
                    }`,
                  }}
                >
                  {c.mode}
                </span>
                <span className="text-[6.5px] text-[#444]">
                  {fmtAge(c.age_seconds)}
                </span>
                <button
                  onClick={() => releaseIp(c.ip)}
                  disabled={releasing === c.ip}
                  className="text-[6px] text-[#333] hover:text-[#00FF41] transition-colors px-1"
                >
                  {releasing === c.ip ? "..." : "RELEASE"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Per-Alert Explainability */}
        {alertLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-30">
            <div className="w-2 h-2 rounded-full bg-[#FF2020] animate-pulse" />
            <span className="text-[7px] tracking-widest uppercase text-[#555]">
              Awaiting threats...
            </span>
          </div>
        ) : (
          alertLogs.map((log) => (
            <AlertCard
              key={log.threat_id}
              log={log}
              token={token || ""}
              onContained={onRefresh}
            />
          ))
        )}
      </div>
    </div>
  );
}
