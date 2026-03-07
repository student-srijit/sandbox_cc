"use client";

import { useEffect, useRef, useState } from "react";
import ThreatContained from "./ThreatContained";
import { useAuth } from "@/components/AuthProvider";

type ThreatsPayload = {
  containment?: {
    active_count?: number;
    containments?: Array<{ threat_id: string | null }>;
  };
};

export default function ThreatContainedTrigger() {
  const [open, setOpen] = useState(false);
  const [capturedThreatId, setCapturedThreatId] = useState<string | null>(null);
  const { token } = useAuth();
  const lastShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function pollContainmentState() {
      try {
        const res = await fetch("/api/threats", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = (await res.json()) as ThreatsPayload;
        const containments = data.containment?.containments || [];
        const newestThreatId =
          containments.find((entry) => !!entry.threat_id)?.threat_id || null;

        if (!newestThreatId) return;
        if (lastShownRef.current === newestThreatId) return;

        lastShownRef.current = newestThreatId;
        setCapturedThreatId(newestThreatId);
        setOpen(true);
      } catch {
        // Ignore polling hiccups; next interval will retry.
      }
    }

    pollContainmentState();
    const id = setInterval(pollContainmentState, 3000);
    return () => clearInterval(id);
  }, [token]);

  return (
    <ThreatContained
      open={open}
      onClose={() => setOpen(false)}
      threatId={capturedThreatId}
      token={token}
    />
  );
}
