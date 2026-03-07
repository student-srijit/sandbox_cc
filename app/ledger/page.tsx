"use client";

import { useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import Topbar from "@/components/Topbar";
import DynamicTitle from "@/components/DynamicTitle";
import SvgDefs from "@/components/SvgDefs";
import AmbientLayer from "@/components/AmbientLayer";
import HexGridCanvas from "@/components/HexGridCanvas";
import CustomCursor from "@/components/CustomCursor";
import {
  CHAIN_LABEL,
  getContractsForChain,
  isContractsConfigured,
  type SupportedChain,
} from "@/lib/contracts";
import { EVIDENCE_ATTESTATION_ABI } from "@/lib/web3/abis";

interface LedgerEntry {
  threat_id: string;
  evidence_id?: string;
  timestamp: string;
  ip: string;
  tier: string;
  toolchain: string;
  attack_type?: string;
  confidence?: number;
  record_type?: "ATTACK" | "REAL_TRANSACTION";
  auto_blocked?: boolean;
  containment_mode?: string | null;
  containment_reason?: string;
  status_label?: string;
  content_hash?: string;
  tx_hash: string;
  source_kind?: "attack" | "wallet_tx";
  explorer_url?: string;
}

interface WalletTx {
  chain: "sepolia" | "celo-sepolia";
  hash: string;
  timestamp: number;
  blockNumber: string;
  from: string;
  to: string;
  value: string;
  symbol: string;
  status: "success" | "failed";
  kind: "native" | "token";
  explorerUrl: string;
  functionName: string;
}

function formatLedgerTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { local: value, utc: "" };
  }

  const local = date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const utc = date.toISOString().replace("T", " ").slice(0, 19);
  return { local, utc };
}

function verifiedStorageKey(chainId: number, address: string | null) {
  return `bb-ledger-verified:${chainId}:${(address || "anon").toLowerCase()}`;
}

function readPersistedVerifiedIds(
  chainId: number,
  address: string | null,
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(
      verifiedStorageKey(chainId, address),
    );
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function persistVerifiedIds(
  chainId: number,
  address: string | null,
  ids: Set<string>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      verifiedStorageKey(chainId, address),
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Ignore storage write failures; on-chain status is still source of truth.
  }
}

export default function LedgerPage() {
  const {
    isActive,
    connectWallet,
    switchChain,
    address,
    chainId,
    preferredChainId,
  } = useWallet();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [verifyTxByThreat, setVerifyTxByThreat] = useState<
    Record<string, string>
  >({});
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [walletTxLoading, setWalletTxLoading] = useState(false);
  const [walletTxRefreshTick, setWalletTxRefreshTick] = useState(0);
  const [sendingRealTx, setSendingRealTx] = useState(false);
  const [realTxError, setRealTxError] = useState<string | null>(null);
  const [lastRealTxHash, setLastRealTxHash] = useState<string | null>(null);

  const activeChain = preferredChainId as SupportedChain;

  const preferredChainLabel =
    preferredChainId === 11155111 ? "sepolia" : "celo-sepolia";

  const txExplorerBase =
    preferredChainId === 11142220
      ? "https://celo-sepolia.blockscout.com/tx/"
      : "https://sepolia.etherscan.io/tx/";

  const mergedEntries = useMemo<LedgerEntry[]>(() => {
    const walletRows: LedgerEntry[] = walletTxs.map((tx) => ({
      threat_id: `USER-TX-${tx.hash.slice(2, 10).toUpperCase()}`,
      timestamp: new Date(tx.timestamp).toISOString(),
      ip: tx.from,
      tier: "HUMAN",
      toolchain: tx.functionName
        ? `Wallet/${tx.functionName}`
        : "Wallet/MetaMask",
      attack_type: "BENIGN_ONCHAIN_TX",
      confidence: 1,
      record_type: "REAL_TRANSACTION",
      auto_blocked: false,
      containment_mode: null,
      containment_reason: "",
      status_label: "REAL_TRANSACTION",
      content_hash: tx.hash,
      tx_hash: tx.hash,
      evidence_id: `USR-${tx.hash.slice(2, 18).toUpperCase()}`,
      source_kind: "wallet_tx",
      explorer_url: tx.explorerUrl,
    }));

    const attackRows: LedgerEntry[] = entries.map((entry) => ({
      ...entry,
      source_kind: entry.source_kind || "attack",
    }));

    return [...walletRows, ...attackRows].sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [entries, walletTxs]);

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const res = await fetch("/api/ledger");
        if (res.ok) {
          const data = await res.json();
          setEntries(data.ledger || []);
        }
      } catch (err) {
        console.error("Failed to fetch ledger:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLedger();
    const interval = setInterval(fetchLedger, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchWalletTxs = async () => {
      if (!isActive || !address) {
        setWalletTxs([]);
        return;
      }

      setWalletTxLoading(true);
      try {
        const res = await fetch(
          `/api/web3/transactions?address=${address}&chain=${preferredChainLabel}&limit=20`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          setWalletTxs([]);
          return;
        }

        const data = await res.json();
        setWalletTxs(Array.isArray(data.transactions) ? data.transactions : []);
      } catch {
        setWalletTxs([]);
      } finally {
        setWalletTxLoading(false);
      }
    };

    fetchWalletTxs();
  }, [address, isActive, preferredChainLabel, walletTxRefreshTick]);

  const handleSendRealUserTx = async () => {
    setRealTxError(null);

    if (!isActive || !address) {
      await connectWallet(preferredChainId);
      return;
    }

    setSendingRealTx(true);
    try {
      if (chainId !== preferredChainId) {
        const switched = await switchChain(preferredChainId);
        if (!switched) {
          throw new Error("Please switch to the selected chain in wallet");
        }
      }

      const eth = (window as Window & { ethereum?: ethers.Eip1193Provider })
        .ethereum;
      if (!eth) {
        throw new Error("Wallet provider unavailable");
      }

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      // Real on-chain transaction: tiny self-transfer to generate auditable history.
      const tx = await signer.sendTransaction({
        to: address,
        value: ethers.parseEther("0.00001"),
      });

      setLastRealTxHash(tx.hash);
      await tx.wait();

      setWalletTxs((prev) => {
        const exists = prev.some(
          (item) => item.hash.toLowerCase() === tx.hash.toLowerCase(),
        );
        if (exists) return prev;
        const optimistic: WalletTx = {
          chain: preferredChainLabel,
          hash: tx.hash,
          timestamp: Date.now(),
          blockNumber: "",
          from: address,
          to: address,
          value: "0.00001",
          symbol: preferredChainId === 11142220 ? "CELO" : "ETH",
          status: "success",
          kind: "native",
          explorerUrl: `${txExplorerBase}${tx.hash}`,
          functionName: "self-transfer",
        };
        return [optimistic, ...prev];
      });

      // Trigger explorer-backed refresh to reconcile exact chain metadata.
      setWalletTxRefreshTick((prev) => prev + 1);
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "shortMessage" in error
          ? String((error as { shortMessage?: string }).shortMessage)
          : error instanceof Error
          ? error.message
          : "Failed to send real transaction";
      setRealTxError(message);
    } finally {
      setSendingRealTx(false);
    }
  };

  useEffect(() => {
    // Warm the UI with last known verified rows until on-chain refresh completes.
    const localIds = readPersistedVerifiedIds(preferredChainId, address);
    if (localIds.size > 0) {
      setVerifiedIds(localIds);
    }
  }, [address, preferredChainId]);

  useEffect(() => {
    const fetchOnChainVerification = async () => {
      if (!isActive || !address || entries.length === 0) {
        const localIds = readPersistedVerifiedIds(preferredChainId, address);
        setVerifiedIds(localIds);
        return;
      }

      try {
        const threatIds = entries
          .filter((entry) => (entry.record_type || "ATTACK") === "ATTACK")
          .map((entry) => entry.threat_id);
        const res = await fetch("/api/ledger/attestation-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chainId: preferredChainId,
            submitter: address,
            threatIds,
          }),
        });

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as { verifiedThreatIds?: string[] };
        const onChainIds = new Set(data.verifiedThreatIds || []);
        const merged = new Set<string>();
        readPersistedVerifiedIds(preferredChainId, address).forEach((id) =>
          merged.add(id),
        );
        onChainIds.forEach((id) => merged.add(id));
        setVerifiedIds(merged);
        persistVerifiedIds(preferredChainId, address, merged);
      } catch {
        // Keep UI usable even if RPC or backend status fetch fails.
      }
    };

    fetchOnChainVerification();
  }, [address, entries, isActive, preferredChainId]);

  const handleVerify = async (entry: LedgerEntry) => {
    setVerifyError(null);

    if (!isActive || !address) {
      await connectWallet(preferredChainId);
      return;
    }

    const contracts = getContractsForChain(activeChain);
    if (!isContractsConfigured(contracts)) {
      setVerifyError(
        `Contracts are missing for ${CHAIN_LABEL[activeChain]}. Run web3 deploy + sync env first.`,
      );
      return;
    }

    const contentHash = entry.content_hash || entry.tx_hash;
    if (!/^0x[a-fA-F0-9]{64}$/.test(contentHash)) {
      setVerifyError("Integrity hash is invalid for on-chain attestation");
      return;
    }

    setVerifying(entry.threat_id);
    try {
      if (chainId !== preferredChainId) {
        const switched = await switchChain(preferredChainId);
        if (!switched) {
          throw new Error("Please switch to the selected chain in wallet");
        }
      }

      const challengeRes = await fetch("/api/ledger/attest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chainId: preferredChainId,
          threatId: entry.threat_id,
          contentHash,
          submitter: address,
        }),
      });

      const challengeData = (await challengeRes.json()) as {
        signingMode?: "server-reviewer" | "client-reviewer";
        domain?: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: string;
        };
        types?: {
          EvidenceRequest: Array<{ name: string; type: string }>;
        };
        value?: {
          submitter: string;
          threatIdHash: string;
          cidHash: string;
          contentHash: string;
          nonce: string;
          deadline: number;
        };
        cid?: string;
        deadline?: number;
        reviewerSignature?: string;
        error?: string;
      };

      if (
        !challengeRes.ok ||
        (challengeData.signingMode !== "client-reviewer" &&
          !challengeData.reviewerSignature)
      ) {
        throw new Error(challengeData.error || "Failed to prepare attestation");
      }

      const eth = (window as Window & { ethereum?: ethers.Eip1193Provider })
        .ethereum;
      if (!eth) {
        throw new Error("Wallet provider unavailable");
      }

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      let reviewerSignature = challengeData.reviewerSignature || "";
      if (challengeData.signingMode === "client-reviewer") {
        if (
          !challengeData.domain ||
          !challengeData.types ||
          !challengeData.value
        ) {
          throw new Error("Invalid attestation challenge payload");
        }
        reviewerSignature = await signer.signTypedData(
          challengeData.domain,
          challengeData.types,
          {
            ...challengeData.value,
            nonce: BigInt(challengeData.value.nonce),
          },
        );
      }

      if (!reviewerSignature) {
        throw new Error("Reviewer signature was not generated");
      }

      const contract = new Contract(
        contracts.evidenceAttestation,
        EVIDENCE_ATTESTATION_ABI,
        signer,
      );

      const tx = await contract.attestEvidence(
        entry.threat_id,
        challengeData.cid,
        contentHash,
        BigInt(challengeData.deadline || 0),
        reviewerSignature,
      );

      await tx.wait();

      setVerifyTxByThreat((prev) => ({
        ...prev,
        [entry.threat_id]: tx.hash,
      }));
      setVerifiedIds((prev) => {
        const next = new Set(prev).add(entry.threat_id);
        persistVerifiedIds(preferredChainId, address, next);
        return next;
      });
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "shortMessage" in error
          ? String((error as { shortMessage?: string }).shortMessage)
          : error instanceof Error
          ? error.message
          : "On-chain verification failed";
      setVerifyError(message);
    } finally {
      setVerifying(null);
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0A0A0F] font-mono text-[var(--text-dim)]">
      <DynamicTitle />
      <SvgDefs />

      <div className="scanline-overlay" />
      <div className="scan-beam" />
      <AmbientLayer />
      <HexGridCanvas />
      <CustomCursor />

      <div className="relative z-10 w-full h-full flex flex-col">
        <div className="h-[64px] flex-shrink-0">
          <Topbar />
        </div>

        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-end justify-between border-b border-[#222] pb-6">
              <div>
                <h1 className="text-3xl font-bold tracking-[0.2em] text-white">
                  IMMUTABLE THREAT LEDGER
                </h1>
                <p className="text-xs text-[var(--accent-magenta)] mt-2 uppercase tracking-widest">
                  Global Decentralized Intelligence Network
                </p>
              </div>

              {!isActive ? (
                <button
                  onClick={() => {
                    void connectWallet();
                  }}
                  className="px-6 py-2 border border-[#00FFD1] bg-[#00FFD1]/10 text-[#00FFD1] hover:bg-[#00FFD1] hover:text-black transition-all font-bold tracking-widest text-xs"
                >
                  CONNECT WALLET TO VERIFY
                </button>
              ) : (
                <div className="px-6 py-2 border border-[#00FF41] bg-[#00FF41]/10 text-[#00FF41] font-bold tracking-widest text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
                  WEB3 IDENTITY SECURED
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-20 text-[#00FFD1] animate-pulse tracking-widest text-sm">
                [ SYNCHRONIZING WITH BLOCKCHAIN... ]
              </div>
            ) : (
              <div className="space-y-6">
                {verifyError && (
                  <div className="border border-[#5f1d2c] bg-[#2b0f16] px-4 py-3 text-xs tracking-wide text-[#ff9fb1]">
                    {verifyError}
                  </div>
                )}

                {realTxError && (
                  <div className="border border-[#5f1d2c] bg-[#2b0f16] px-4 py-3 text-xs tracking-wide text-[#ff9fb1]">
                    {realTxError}
                  </div>
                )}

                {lastRealTxHash && (
                  <div className="border border-[#1b5f4a] bg-[#0f2b22] px-4 py-3 text-xs tracking-wide text-[#9fffd6]">
                    Real user transaction sent: {lastRealTxHash.slice(0, 14)}...
                    {lastRealTxHash.slice(-10)}
                    <a
                      href={`${txExplorerBase}${lastRealTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 underline text-[#8fdfff]"
                    >
                      explorer
                    </a>
                  </div>
                )}

                <div className="bg-[#0b0c10]/80 backdrop-blur-md border border-[#222] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm tracking-[0.2em] text-white uppercase">
                      Your Blockchain Transactions
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-[#8a8f99]">
                        Chain: {preferredChainLabel}
                      </span>
                      <button
                        onClick={() => {
                          void handleSendRealUserTx();
                        }}
                        disabled={sendingRealTx}
                        className="px-3 py-1 border border-[#2a8a5b] bg-[#0f2b1d] text-[#9fffd6] hover:bg-[#143526] disabled:opacity-50 disabled:cursor-not-allowed text-[10px] tracking-widest uppercase"
                      >
                        {sendingRealTx ? "Sending..." : "Send Real Test Tx"}
                      </button>
                    </div>
                  </div>

                  {!isActive ? (
                    <p className="text-xs text-[#7f8490] tracking-widest uppercase">
                      Connect wallet to load your on-chain transaction history.
                    </p>
                  ) : walletTxLoading ? (
                    <p className="text-xs text-[#00FFD1] tracking-widest uppercase animate-pulse">
                      Loading wallet transactions...
                    </p>
                  ) : walletTxs.length === 0 ? (
                    <p className="text-xs text-[#7f8490] tracking-widest uppercase">
                      No explorer transactions found for this wallet on{" "}
                      {preferredChainLabel}.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="border-b border-[#222]">
                          <tr>
                            <th className="px-3 py-2 text-[#888] font-normal uppercase tracking-widest">
                              Time
                            </th>
                            <th className="px-3 py-2 text-[#888] font-normal uppercase tracking-widest">
                              Type
                            </th>
                            <th className="px-3 py-2 text-[#888] font-normal uppercase tracking-widest">
                              Value
                            </th>
                            <th className="px-3 py-2 text-[#888] font-normal uppercase tracking-widest">
                              Status
                            </th>
                            <th className="px-3 py-2 text-[#888] font-normal uppercase tracking-widest">
                              Tx Hash
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {walletTxs.map((tx) => (
                            <tr
                              key={`${tx.kind}:${tx.hash}:${tx.timestamp}`}
                              className="border-b border-[#15171d]"
                            >
                              <td className="px-3 py-2 text-[#b8bdc8]">
                                {new Date(tx.timestamp)
                                  .toISOString()
                                  .replace("T", " ")
                                  .slice(0, 19)}
                              </td>
                              <td className="px-3 py-2 text-[#c6ccda] uppercase tracking-wider">
                                {tx.kind}
                              </td>
                              <td className="px-3 py-2 text-[#00FFD1]">
                                {tx.value} {tx.symbol}
                              </td>
                              <td
                                className={`px-3 py-2 uppercase tracking-widest ${
                                  tx.status === "success"
                                    ? "text-[#00FF41]"
                                    : "text-[#FF4D6D]"
                                }`}
                              >
                                {tx.status}
                              </td>
                              <td className="px-3 py-2">
                                <a
                                  href={tx.explorerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--accent-magenta)] underline"
                                >
                                  {tx.hash.slice(0, 12)}...{tx.hash.slice(-10)}
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-[#0b0c10]/80 backdrop-blur-md border border-[#222]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#333] bg-black">
                      <tr>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Timestamp (UTC)
                        </th>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Threat ID
                        </th>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Origins
                        </th>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Toolchain
                        </th>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Integrity Hash
                        </th>
                        <th className="px-6 py-4 tracking-widest uppercase text-[#888] font-normal">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#111]">
                      {mergedEntries.map((entry) => {
                        const isVerified = verifiedIds.has(entry.threat_id);
                        const isVerifying = verifying === entry.threat_id;
                        const isWalletTxRow = entry.source_kind === "wallet_tx";
                        const isAttack =
                          (entry.record_type || "ATTACK") === "ATTACK";
                        const isAutoBlocked = Boolean(entry.auto_blocked);

                        return (
                          <tr
                            key={entry.threat_id}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-[#aaa]">
                              {(() => {
                                const ts = formatLedgerTimestamp(
                                  entry.timestamp,
                                );
                                return (
                                  <div className="leading-tight">
                                    <div>{ts.local}</div>
                                    {ts.utc && (
                                      <div className="text-[10px] text-[#6f7684]">
                                        {ts.utc} UTC
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-[#00FF41]">
                                {entry.threat_id}
                              </span>
                              <div className="mt-1">
                                <span
                                  className={`inline-block px-2 py-0.5 text-[10px] tracking-widest border rounded-[2px] ${
                                    isAttack
                                      ? "text-[#ff9b9b] border-[#5f1d2c] bg-[#2b0f16]"
                                      : "text-[#9fffd6] border-[#1b5f4a] bg-[#0f2b22]"
                                  }`}
                                >
                                  {isAttack ? "ATTACK" : "REAL TX"}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-[#ccc]">
                              {isWalletTxRow
                                ? `${entry.ip.slice(0, 8)}...${entry.ip.slice(
                                    -6,
                                  )}`
                                : entry.ip}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className="px-2 py-1 bg-[#222] text-[#e0e0e0] border border-[#444] rounded-[2px]">
                                  {entry.toolchain}
                                </span>
                                {entry.attack_type && (
                                  <span className="text-[10px] text-[#9ea7b5] tracking-wide">
                                    {entry.attack_type}
                                    {typeof entry.confidence === "number"
                                      ? ` (${Math.round(
                                          entry.confidence * 100,
                                        )}%)`
                                      : ""}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-[#aaa] font-mono tracking-tight text-[10px]">
                              {entry.tx_hash.substring(0, 16)}...
                              {entry.tx_hash.substring(
                                entry.tx_hash.length - 12,
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col gap-2">
                                {isAutoBlocked && (
                                  <div className="text-[#ff6b7a] tracking-widest text-[10px] uppercase">
                                    AUTO BLOCKED
                                    {entry.containment_mode
                                      ? ` · ${entry.containment_mode}`
                                      : ""}
                                  </div>
                                )}

                                {isWalletTxRow ? (
                                  <div className="flex items-center gap-2 text-[#9fffd6] uppercase tracking-widest text-[10px]">
                                    REAL USER TX
                                    {entry.explorer_url && (
                                      <a
                                        href={entry.explorer_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] underline text-[#8fdfff]"
                                      >
                                        explorer
                                      </a>
                                    )}
                                  </div>
                                ) : isVerified ? (
                                  <div className="flex items-center gap-2 text-[#00FFD1]">
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    VERIFIED
                                    {verifyTxByThreat[entry.threat_id] && (
                                      <a
                                        href={`${
                                          preferredChainId === 11142220
                                            ? "https://celo-sepolia.blockscout.com/tx/"
                                            : "https://sepolia.etherscan.io/tx/"
                                        }${verifyTxByThreat[entry.threat_id]}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] underline text-[#8fdfff]"
                                      >
                                        tx
                                      </a>
                                    )}
                                  </div>
                                ) : isVerifying ? (
                                  <div className="flex items-center gap-2 text-[#FFD700] animate-pulse">
                                    [ SIGNING TX... ]
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleVerify(entry)}
                                    className="text-[#aaa] hover:text-[#00FFD1] transition-colors tracking-widest uppercase text-[10px]"
                                  >
                                    VERIFY HASH
                                  </button>
                                )}

                                {entry.containment_reason && (
                                  <div className="text-[10px] text-[#7d8596] max-w-[280px] whitespace-normal">
                                    {entry.containment_reason}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {mergedEntries.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-12 text-center text-[#666] tracking-widest"
                          >
                            NO THREAT LOGS FOUND IN BLOCK HEIGHT
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
