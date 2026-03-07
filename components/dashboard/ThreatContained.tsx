"use client";

import { useEffect, useState } from "react";

type ReplayPayload = {
  threat_id: string;
  session_id: string;
  ip: string;
  toolchain: string;
  attack_type: string;
  time_wasted_seconds: number;
  total_steps: number;
  classification?: {
    confidence?: number;
    attack_technique_id?: string;
    attack_technique_name?: string;
    attack_tactic?: string;
    trigger_reason?: string;
  };
};

interface ThreatContainedProps {
  open: boolean;
  onClose: () => void;
  threatId?: string | null;
  token?: string | null;
}

function formatDuration(seconds: number) {
  const value = Math.max(0, seconds);
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

export default function ThreatContained({
  open,
  onClose,
  threatId,
  token,
}: ThreatContainedProps) {
  const [details, setDetails] = useState<ReplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !threatId || !token) {
      setDetails(null);
      setError(null);
      return;
    }

    async function loadThreat() {
      try {
        const res = await fetch(`/api/replay/${threatId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          setError("Unable to load real threat dossier.");
          return;
        }

        const payload = (await res.json()) as ReplayPayload;
        setDetails(payload);
        setError(null);
      } catch {
        setError("Unable to load real threat dossier.");
      }
    }

    loadThreat();
  }, [open, threatId, token]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-3xl border border-[#3a0f16] bg-[linear-gradient(180deg,#0d0809,#090507)] shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-[#2f1015] px-5 py-3">
          <div>
            <p className="text-[10px] tracking-[0.35em] uppercase text-[#ff5050]">
              Threat Contained
            </p>
            <p className="mt-1 text-[11px] text-[#ad7b7b]">
              Real incident data only
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] tracking-[0.2em] uppercase text-[#d6a1a1] hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          {!threatId && (
            <div className="border border-[#2d1a1a] bg-[#120b0d] p-4 text-[12px] text-[#c99a9a]">
              No containment threat ID was provided.
            </div>
          )}

          {error && (
            <div className="border border-[#3f1d22] bg-[#1b0c10] p-4 text-[12px] text-[#e4a6ae]">
              {error}
            </div>
          )}

          {!error && threatId && !details && (
            <div className="border border-[#27322f] bg-[#0d1412] p-4 text-[12px] text-[#9bb3ab]">
              Loading threat dossier from live backend...
            </div>
          )}

          {details && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 border border-[#1f2a29] bg-[#0a1110] p-4">
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#88a2a1]">
                  Threat Metadata
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>ID:</strong> {details.threat_id}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Session:</strong> {details.session_id}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Source IP:</strong> {details.ip}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Attack Type:</strong> {details.attack_type}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Toolchain:</strong> {details.toolchain}
                </div>
              </div>

              <div className="space-y-2 border border-[#1f2a29] bg-[#0a1110] p-4">
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#88a2a1]">
                  Containment Impact
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Total Steps:</strong> {details.total_steps}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Time Wasted:</strong>{" "}
                  {formatDuration(details.time_wasted_seconds)}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Confidence:</strong>{" "}
                  {typeof details.classification?.confidence === "number"
                    ? `${Math.round(details.classification.confidence * 100)}%`
                    : "N/A"}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>ATT&CK:</strong>{" "}
                  {details.classification?.attack_technique_id || "N/A"}{" "}
                  {details.classification?.attack_technique_name || ""}
                </div>
                <div className="text-[13px] text-[#deebea]">
                  <strong>Tactic:</strong>{" "}
                  {details.classification?.attack_tactic || "N/A"}
                </div>
              </div>

              <div className="md:col-span-2 border border-[#1f2a29] bg-[#0a1110] p-4">
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#88a2a1]">
                  Trigger Reason
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[#bfd0cc]">
                  {details.classification?.trigger_reason ||
                    "No trigger reason available for this threat."}
                </p>
              </div>

              <div className="md:col-span-2 flex gap-2">
                <a
                  href={`/api/report/${details.threat_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center border border-[#2a5f45] bg-[#123423] px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-[#72f1b4] hover:bg-[#18452f]"
                >
                  Export Threat Report
                </a>
                <button
                  onClick={onClose}
                  className="inline-flex items-center justify-center border border-[#3f2328] bg-[#1b0f12] px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-[#d7a2ac] hover:bg-[#281419]"
                >
                  Return To War Room
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
