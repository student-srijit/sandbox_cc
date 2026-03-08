"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { useWallet } from "@/components/WalletProvider";
import {
  BOUNTY_ESCROW_ABI,
  REPORT_ACCESS_NFT_ABI,
  ENTERPRISE_LICENSE_NFT_ABI,
} from "@/lib/web3/abis";
import { getContractsForChain } from "@/lib/contracts";
import { SUPPORTED_CHAINS, type SupportedChainId } from "@/lib/web3/chains";

// ─── types ───────────────────────────────────────────────────────────────────

type MarketData = {
  eth: { price: number; change24h: number; vol24h: number; marketCap: number };
  celo: { price: number; change24h: number };
  sepolia: { gasGwei: number; priorityGwei: number; blockNumber: number };
  celo_sepolia: { blockNumber: number };
  updatedAt: number;
};

type ThreatReport = {
  id: string;
  title: string;
  category: "MEV" | "Flash Loan" | "Rug Pull" | "Bridge Exploit" | "Phishing" | "Smart Contract";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  description: string;
  indicators: string[];
  priceEth: string;
  priceUsd: string;
  reportId: string; // bytes32 keccak for contract
  publishedAt: string;
  attackerWallet?: string;
  chainId: string;
  exploitTx?: string;
};

type LiveBounty = {
  bountyId: number;
  creator: string;
  token: string;
  amount: string;
  symbol: string;
  deadline: number;
  state: "Open" | "Awarded" | "Disputed" | "Refunded";
};

type OnchainStats = {
  nextBountyId: number;
  loading: boolean;
};

// ─── static report catalogue ────────────────────────────────────────────────

const CATALOG: ThreatReport[] = [
  {
    id: "r1",
    title: "Flash Loan Arbitrage Cluster — Uniswap V3 / Aave",
    category: "Flash Loan",
    severity: "CRITICAL",
    description:
      "Full dossier on a coordinated flash-loan arbitrage cluster that extracted $2.4M across 17 transactions. Includes wallet graph, profit traces, frontrun vectors, and IPFS CID of raw tx data.",
    indicators: [
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
      "Uniswap V3 sandwich pattern",
    ],
    priceEth: "0.012",
    priceUsd: "38.90",
    reportId: "0x" + "a1".repeat(32).slice(0, 64),
    publishedAt: "2026-03-05",
    attackerWallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: "1",
    exploitTx: "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
  },
  {
    id: "r2",
    title: "Rug Pull Forensics — ERC-20 Honeytrap Token",
    category: "Rug Pull",
    severity: "HIGH",
    description:
      "Post-mortem of a honeytrap ERC-20 token. The `transfer` function silently blocks sells via hidden allowance check. Includes deployer wallet, liquidity drain tx, and social engineering analysis.",
    indicators: [
      "Hidden _allowance mapping with backdoor",
      "Owner reserved 40% at deploy",
      "Liquidity pulled within 72h",
    ],
    priceEth: "0.008",
    priceUsd: "25.93",
    reportId: "0x" + "b2".repeat(32).slice(0, 64),
    publishedAt: "2026-03-04",
    attackerWallet: "0xAbCd1234567890AbCd1234567890AbCd12345678",
    chainId: "56",
    exploitTx: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  },
  {
    id: "r3",
    title: "Bridge Exploit — Cross-Chain Message Replay",
    category: "Bridge Exploit",
    severity: "CRITICAL",
    description:
      "Replay attack on a Wormhole-style bridge. Attacker replicated a valid message ID across two chains simultaneously. $890K extracted. Full log of guardian signatures and nonce collision proof.",
    indicators: [
      "Duplicate message ID 0x7f3a...",
      "Wormhole guardian set 3",
      "Multichain nonce desync",
    ],
    priceEth: "0.025",
    priceUsd: "81.04",
    reportId: "0x" + "c3".repeat(32).slice(0, 64),
    publishedAt: "2026-03-01",
    chainId: "43114",
  },
  {
    id: "r4",
    title: "MEV Sandwich Bot — Uniswap V2 Pattern",
    category: "MEV",
    severity: "MEDIUM",
    description:
      "Profiling of a sandwich bot operating on Uniswap V2. Documents mempool monitoring strategy, gas-price shading, slippage targeting, and estimated profit of 4.2 ETH/day.",
    indicators: [
      "Gas price ± 1 gwei shading",
      "0.3% to 0.8% slippage targets",
      "avg block lag 1.2 blocks",
    ],
    priceEth: "0.005",
    priceUsd: "16.21",
    reportId: "0x" + "d4".repeat(32).slice(0, 64),
    publishedAt: "2026-02-28",
    chainId: "1",
  },
  {
    id: "r5",
    title: "Smart Contract Re-Entrancy — DeFi Lending Pool",
    category: "Smart Contract",
    severity: "HIGH",
    description:
      "Re-entrancy exploit in a forked Compound protocol. Contracts did not follow checks-effects-interactions. Full call graph, PoC exploit code (sanitized), and remediation patch included.",
    indicators: [
      "withdraw() calls external before state update",
      "Missing ReentrancyGuard",
      "Attacker contract: 0xBaD...",
    ],
    priceEth: "0.015",
    priceUsd: "48.62",
    reportId: "0x" + "e5".repeat(32).slice(0, 64),
    publishedAt: "2026-02-25",
    chainId: "137",
  },
  {
    id: "r6",
    title: "Wallet Drainer Phishing Kit — IPFS Hosted",
    category: "Phishing",
    severity: "HIGH",
    description:
      "Full analysis of a Metamask-spoofing phishing kit hosted on IPFS. Includes the obfuscated JS drainer source, C2 drain wallet, 127 confirmed victims, and total drained value of $340K.",
    indicators: [
      "IPFS CID: bafybeihdwdcef...",
      "Drainer wallet: 0xDead...",
      "setApprovalForAll abuse",
    ],
    priceEth: "0.009",
    priceUsd: "29.17",
    reportId: "0x" + "f6".repeat(32).slice(0, 64),
    publishedAt: "2026-02-20",
    chainId: "1",
  },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    planId: "0x" + "aa".repeat(32).slice(0, 64),
    priceEth: "0.05",
    priceMonth: "$162",
    seats: 1,
    features: ["5 threat reports/mo", "API access (100 req/day)", "Basic IOC feed", "Email alerts"],
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro SOC",
    planId: "0x" + "bb".repeat(32).slice(0, 64),
    priceEth: "0.15",
    priceMonth: "$486",
    seats: 10,
    features: ["Unlimited reports", "Real-time IOC webhook", "Threat graph API", "SIEM integration", "Slack / Discord bot", "10 analyst seats"],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    planId: "0x" + "cc".repeat(32).slice(0, 64),
    priceEth: "0.5",
    priceMonth: "$1,621",
    seats: 100,
    features: ["Everything in Pro", "Dedicated threat briefing", "On-chain evidence NFTs", "Custom bounty programs", "SLA 4h response", "Unlimited seats"],
    highlight: false,
  },
];

const SEVERITY_COLOUR: Record<string, string> = {
  CRITICAL: "text-[#ff4b4b] border-[#5c1a1a] bg-[#1f0c0c]",
  HIGH: "text-[#ffaa33] border-[#4f3314] bg-[#1e1506]",
  MEDIUM: "text-[#f5e642] border-[#4a430e] bg-[#1a1a06]",
};

const CAT_COLOUR: Record<string, string> = {
  "MEV": "text-[#c084fc]",
  "Flash Loan": "text-[#f97316]",
  "Rug Pull": "text-[#f43f5e]",
  "Bridge Exploit": "text-[#fb923c]",
  "Phishing": "text-[#facc15]",
  "Smart Contract": "text-[#38bdf8]",
};

function shortAddr(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmtChange(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtLargeNum(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function bountyStateLabel(s: string) {
  const m: Record<string, string> = {
    Open: "OPEN",
    Awarded: "AWARDED",
    Disputed: "DISPUTED",
    Refunded: "REFUNDED",
  };
  return m[s] ?? s;
}

function bountyStateColour(s: string) {
  if (s === "Open") return "text-[#67f8ab] bg-[#0a2b1a]";
  if (s === "Awarded") return "text-[#60a5fa] bg-[#0d1e33]";
  return "text-[#aaa] bg-[#1a1a1a]";
}

// ─── component ──────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { isActive, address, chainId, connectWallet, switchChain } = useWallet();
  const [market, setMarket] = useState<MarketData | null>(null);
  const [marketAge, setMarketAge] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [bounties, setBounties] = useState<LiveBounty[]>([]);
  const [onchainStats, setOnchainStats] = useState<OnchainStats>({ nextBountyId: 0, loading: true });
  const [buyingReport, setBuyingReport] = useState<string | null>(null);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"reports" | "bounties" | "plans">("reports");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── market data ──────────────────────────────────────────────────────────
  const fetchMarket = useCallback(async () => {
    try {
      const r = await fetch("/api/web3/market-data");
      if (r.ok) {
        const d: MarketData = await r.json();
        setMarket(d);
        setMarketAge(0);
      }
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    fetchMarket();
    intervalRef.current = setInterval(() => {
      setMarketAge((a) => a + 1);
      if (marketAge > 0 && marketAge % 30 === 0) fetchMarket();
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMarket, marketAge]);

  // ── on-chain bounty list ──────────────────────────────────────────────────
  const fetchBounties = useCallback(async () => {
    const supportedChain: SupportedChainId = 11155111;
    const contracts = getContractsForChain(supportedChain);
    if (!contracts.bountyEscrow) return;
    const chainConfig = SUPPORTED_CHAINS[supportedChain];
    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrls[0]);
      const escrow = new ethers.Contract(contracts.bountyEscrow, BOUNTY_ESCROW_ABI, provider);
      const nextId = Number(await escrow.nextBountyId());
      setOnchainStats({ nextBountyId: nextId, loading: false });
      const fetched: LiveBounty[] = [];
      const start = Math.max(1, nextId - 10);
      for (let i = start; i < nextId; i++) {
        try {
          const b = await escrow.bounties(i);
          const states = ["Open", "Awarded", "Disputed", "Refunded"] as const;
          fetched.push({
            bountyId: i,
            creator: b[0],
            token: b[1],
            amount: ethers.formatEther(b[2]),
            symbol: b[1] === ethers.ZeroAddress ? "ETH" : "TOKEN",
            deadline: Number(b[3]) * 1000,
            state: states[Number(b[4])] ?? "Open",
          });
        } catch { /* skip unreadable bounty */ }
      }
      setBounties(fetched.reverse());
    } catch { /* RPC may be down in hackathon env */ }
  }, []);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);

  // ── buy report ────────────────────────────────────────────────────────────
  const handleBuyReport = useCallback(async (report: ThreatReport) => {
    if (!isActive || !address) { connectWallet(); return; }
    const supportedChain: SupportedChainId = 11155111;
    if (chainId !== supportedChain) { await switchChain(supportedChain); return; }
    const contracts = getContractsForChain(supportedChain);
    if (!contracts.reportAccessNFT) {
      setTxMsg("Contract not configured. Deploy first.");
      return;
    }
    try {
      setBuyingReport(report.id);
      setTxMsg("Waiting for wallet confirmation…");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(contracts.reportAccessNFT, REPORT_ACCESS_NFT_ABI, signer);
      const priceWei = ethers.parseEther(report.priceEth);
      const tx = await nft.buyWithNative(report.reportId, address, { value: priceWei });
      setTxMsg(`Transaction sent: ${tx.hash.slice(0, 16)}… (waiting for confirmation)`);
      await tx.wait();
      setTxMsg(`✓ Report NFT minted! TX: ${tx.hash.slice(0, 16)}…`);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "shortMessage" in e
        ? (e as { shortMessage: string }).shortMessage
        : "Transaction cancelled";
      setTxMsg(`Error: ${msg}`);
    } finally {
      setBuyingReport(null);
    }
  }, [isActive, address, chainId, connectWallet, switchChain]);

  // ── buy plan ─────────────────────────────────────────────────────────────
  const handleBuyPlan = useCallback(async (plan: typeof PLANS[0]) => {
    if (!isActive || !address) { connectWallet(); return; }
    const supportedChain: SupportedChainId = 11155111;
    if (chainId !== supportedChain) { await switchChain(supportedChain); return; }
    const contracts = getContractsForChain(supportedChain);
    if (!contracts.enterpriseLicenseNFT) {
      setTxMsg("Contract not configured. Deploy first.");
      return;
    }
    try {
      setActivePlan(plan.id);
      setTxMsg("Waiting for wallet confirmation…");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(contracts.enterpriseLicenseNFT, ENTERPRISE_LICENSE_NFT_ABI, signer);
      const priceWei = ethers.parseEther(plan.priceEth);
      const tx = await nft.buyWithNative(plan.planId, address, plan.seats, { value: priceWei });
      setTxMsg(`Transaction sent: ${tx.hash.slice(0, 16)}…`);
      await tx.wait();
      setTxMsg(`✓ License NFT minted (${plan.seats} seats)! TX: ${tx.hash.slice(0, 16)}…`);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "shortMessage" in e
        ? (e as { shortMessage: string }).shortMessage
        : "Transaction cancelled";
      setTxMsg(`Error: ${msg}`);
    } finally {
      setActivePlan(null);
    }
  }, [isActive, address, chainId, connectWallet, switchChain]);

  const filtered = filter === "all" ? CATALOG : CATALOG.filter((r) => r.category === filter);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#04080f] text-[#e4f0ff] flex flex-col">
      <div className="flex-shrink-0">
        <Topbar />
      </div>

      <main className="flex-1 overflow-y-auto">
      <div className="px-4 py-8 max-w-7xl mx-auto w-full">

        {/* ── header ── */}
        <div className="mb-8">
          <p className="text-[11px] tracking-[0.32em] uppercase text-[#7bbcf3] mb-2">
            On-Chain Intelligence Exchange
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Threat Intel Marketplace
          </h1>
          <p className="mt-2 text-sm text-[#8aa4be] max-w-2xl">
            Buy verifiable threat intelligence reports as NFTs on Sepolia. Post bounties for
            security research. All purchases and attestations are immutable on-chain.
          </p>
          <div className="mt-4 flex items-center gap-3 flex-wrap text-xs">
            <Link href="/vault" className="px-3 py-1.5 border border-[#2a8a5b] bg-[#0a1f13] text-[#67f8ab] rounded hover:bg-[#0f2b1d]">
              ← Vault
            </Link>
            <Link href="/ledger" className="px-3 py-1.5 border border-[#355d92] bg-[#0d1c30] text-[#9cc9ff] rounded hover:bg-[#132540]">
              Ledger
            </Link>
            <Link href="/web3" className="px-3 py-1.5 border border-[#2a3f5a] bg-[#09121e] text-[#7bbcf3] rounded hover:bg-[#0f1e30]">
              Web3 Hub
            </Link>
          </div>
        </div>

        {/* ── live market ticker ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            {
              label: "ETH Price",
              value: market ? `$${market.eth.price.toLocaleString()}` : "…",
              sub: market ? fmtChange(market.eth.change24h) : "",
              positive: market ? market.eth.change24h >= 0 : true,
            },
            {
              label: "24h Volume",
              value: market ? fmtLargeNum(market.eth.vol24h) : "…",
              sub: "ETH market",
              positive: true,
            },
            {
              label: "Sepolia Gas",
              value: market ? `${market.sepolia.gasGwei} gwei` : "…",
              sub: market ? `priority +${market.sepolia.priorityGwei}` : "",
              positive: true,
            },
            {
              label: "Sepolia Block",
              value: market ? `#${market.sepolia.blockNumber.toLocaleString()}` : "…",
              sub: "latest",
              positive: true,
            },
            {
              label: "Bounties Posted",
              value: onchainStats.loading ? "…" : String(Math.max(0, onchainStats.nextBountyId - 1)),
              sub: "on-chain",
              positive: true,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded border border-[#1a2d45] bg-[#070d17] px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#5a7a9a] mb-1">
                {item.label}
              </p>
              <p className="text-base font-mono font-semibold">{item.value}</p>
              {item.sub && (
                <p className={`text-[11px] mt-0.5 ${item.positive ? "text-[#67f8ab]" : "text-[#f87171]"}`}>
                  {item.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── tx notification ── */}
        {txMsg && (
          <div className="mb-6 px-4 py-3 rounded border border-[#2a5c8a] bg-[#0a1e30] text-sm text-[#9cc9ff] flex justify-between items-start">
            <span>{txMsg}</span>
            <button onClick={() => setTxMsg(null)} className="ml-4 text-[#5a8aaa] hover:text-white">✕</button>
          </div>
        )}

        {/* ── wallet banner ── */}
        {!isActive && (
          <div className="mb-6 px-4 py-3 rounded border border-[#3a3020] bg-[#12100a] text-sm text-[#ffcc66] flex items-center justify-between">
            <span>Connect your wallet to purchase reports and post bounties on-chain.</span>
            <button
              onClick={() => connectWallet()}
              className="ml-4 px-3 py-1 rounded border border-[#ffaa33] text-[#ffaa33] text-xs hover:bg-[#201600]"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* ── tabs ── */}
        <div className="flex gap-1 mb-6 border-b border-[#1a2d45]">
          {(["reports", "bounties", "plans"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs tracking-[0.14em] uppercase transition-colors ${
                tab === t
                  ? "text-[#9cc9ff] border-b-2 border-[#4a8ecc]"
                  : "text-[#4a6a8a] hover:text-[#7aaace]"
              }`}
            >
              {t === "reports" ? "Threat Reports" : t === "bounties" ? "Live Bounties" : "License Plans"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════ REPORTS TAB ════════ */}
        {tab === "reports" && (
          <>
            {/* category filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              {["all", "MEV", "Flash Loan", "Rug Pull", "Bridge Exploit", "Phishing", "Smart Contract"].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-3 py-1 text-[11px] rounded border transition-colors ${
                    filter === c
                      ? "border-[#4a8ecc] bg-[#0d1e30] text-[#9cc9ff]"
                      : "border-[#1a2d45] text-[#4a6a8a] hover:text-[#7aaace]"
                  }`}
                >
                  {c === "all" ? "All Categories" : c}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((report) => (
                <article
                  key={report.id}
                  className="rounded-md border border-[#1a2d45] bg-[#060d18] flex flex-col hover:border-[#2a4d6a] transition-colors"
                >
                  <div className="p-4 flex-1">
                    {/* top row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className={`text-[10px] tracking-widest uppercase font-mono px-2 py-0.5 rounded border ${SEVERITY_COLOUR[report.severity]}`}>
                        {report.severity}
                      </span>
                      <span className={`text-[11px] ${CAT_COLOUR[report.category]}`}>
                        {report.category}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold leading-snug mb-2">{report.title}</h3>
                    <p className="text-[12px] text-[#7a98b8] leading-relaxed mb-3">
                      {report.description}
                    </p>

                    {/* IOC chips */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {report.indicators.map((ioc, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0a1626] border border-[#1a2d45] text-[#5a8aaa]"
                        >
                          {ioc.length > 28 ? shortAddr(ioc) : ioc}
                        </span>
                      ))}
                    </div>

                    {/* attacker wallet & tx */}
                    {report.attackerWallet && (
                      <div className="text-[11px] font-mono text-[#f87171] mb-1">
                        Attacker: {shortAddr(report.attackerWallet)}
                      </div>
                    )}
                    {report.exploitTx && (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${report.exploitTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono text-[#4a8ecc] hover:underline"
                      >
                        Exploit TX: {shortAddr(report.exploitTx)}
                      </a>
                    )}
                  </div>

                  {/* buy footer */}
                  <div className="border-t border-[#121f30] px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-base font-semibold font-mono">{report.priceEth} ETH</span>
                      <span className="text-xs text-[#5a7a9a] ml-2">≈ ${report.priceUsd}</span>
                      <p className="text-[10px] text-[#3a5a7a] mt-0.5">Published {report.publishedAt}</p>
                    </div>
                    <button
                      onClick={() => handleBuyReport(report)}
                      disabled={buyingReport === report.id}
                      className="px-4 py-2 text-xs rounded border border-[#2a8a5b] bg-[#081d11] text-[#67f8ab] hover:bg-[#0f2b1d] disabled:opacity-50 disabled:cursor-wait transition-colors"
                    >
                      {buyingReport === report.id ? "Pending…" : "Buy NFT"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════ BOUNTIES TAB ═══════ */}
        {tab === "bounties" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[#7a98b8]">
                Open research bounties posted on-chain via BountyEscrow.sol — Sepolia testnet
              </p>
              <Link
                href="/vault"
                className="px-4 py-2 text-xs rounded border border-[#2a8a5b] bg-[#081d11] text-[#67f8ab] hover:bg-[#0f2b1d]"
              >
                + Post Bounty
              </Link>
            </div>

            {bounties.length === 0 ? (
              <div className="rounded border border-[#1a2d45] bg-[#060d18] px-6 py-10 text-center text-sm text-[#4a6a8a]">
                {onchainStats.loading
                  ? "Loading on-chain bounties…"
                  : "No bounties on-chain yet. Post the first one from the Vault."}
              </div>
            ) : (
              <div className="space-y-3">
                {bounties.map((b) => {
                  const isExpired = b.deadline < Date.now();
                  const deadlineStr = new Date(b.deadline).toLocaleString();
                  return (
                    <div
                      key={b.bountyId}
                      className="rounded border border-[#1a2d45] bg-[#060d18] px-5 py-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-[#5a7a9a]">
                            #{b.bountyId}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${bountyStateColour(b.state)}`}>
                            {bountyStateLabel(b.state)}
                          </span>
                          {isExpired && b.state === "Open" && (
                            <span className="text-[10px] text-[#f87171]">expired</span>
                          )}
                        </div>
                        <p className="text-xs text-[#8aaccc] font-mono truncate">
                          Creator: {shortAddr(b.creator)}
                        </p>
                        <p className="text-[11px] text-[#4a6a8a] mt-0.5">
                          Deadline: {deadlineStr}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-semibold font-mono">
                          {parseFloat(b.amount).toFixed(4)} {b.symbol}
                        </p>
                        <a
                          href={`https://sepolia.etherscan.io/address/0x56280229FEbEfD81F91D9CaEEaafed8dfcf4B64e`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#4a8ecc] hover:underline"
                        >
                          View on Explorer ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* contract info */}
            <div className="mt-6 rounded border border-[#1a2d45] bg-[#060d18] p-4 text-xs">
              <p className="text-[#5a7a9a] mb-2 uppercase tracking-wider text-[10px]">BountyEscrow Contract — Sepolia</p>
              <a
                href="https://sepolia.etherscan.io/address/0x56280229FEbEfD81F91D9CaEEaafed8dfcf4B64e"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[#4a8ecc] hover:underline break-all"
              >
                0x56280229FEbEfD81F91D9CaEEaafed8dfcf4B64e
              </a>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════ PLANS TAB ══════════ */}
        {tab === "plans" && (
          <div>
            <p className="text-sm text-[#7a98b8] mb-6">
              License NFT plans minted on-chain. The NFT proves your subscription and can be
              transferred, verified, or revoked transparently without any central authority.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-md border flex flex-col ${
                    plan.highlight
                      ? "border-[#4a8ecc] bg-[#060f1a] shadow-[0_0_40px_rgba(74,142,204,0.12)]"
                      : "border-[#1a2d45] bg-[#060d18]"
                  }`}
                >
                  {plan.highlight && (
                    <div className="text-center py-1.5 bg-[#0d2240] text-[11px] tracking-widest uppercase text-[#60a5fa] border-b border-[#1a2d45]">
                      Most Popular
                    </div>
                  )}
                  <div className="p-5 flex-1">
                    <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
                    <div className="mb-1">
                      <span className="text-2xl font-mono font-bold">{plan.priceEth}</span>
                      <span className="text-sm text-[#5a7a9a] ml-1">ETH</span>
                    </div>
                    <p className="text-xs text-[#4a6a8a] mb-4">
                      ≈ {plan.priceMonth}/month · {plan.seats === 1 ? "1 seat" : `up to ${plan.seats} seats`}
                    </p>
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="text-xs flex items-start gap-2">
                          <span className="text-[#67f8ab] mt-0.5">✓</span>
                          <span className="text-[#8aaccc]">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 border-t border-[#121f30]">
                    <button
                      onClick={() => handleBuyPlan(plan)}
                      disabled={activePlan === plan.id}
                      className={`w-full py-2 text-xs rounded border transition-colors disabled:opacity-50 disabled:cursor-wait ${
                        plan.highlight
                          ? "border-[#4a8ecc] bg-[#0d1e30] text-[#9cc9ff] hover:bg-[#132a42]"
                          : "border-[#2a8a5b] bg-[#081d11] text-[#67f8ab] hover:bg-[#0f2b1d]"
                      }`}
                    >
                      {activePlan === plan.id ? "Minting…" : `Mint License NFT`}
                    </button>
                    <p className="text-[10px] text-center text-[#3a5a7a] mt-2">
                      On-chain • EnterpriseLicenseNFT.sol
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* contract info */}
            <div className="mt-6 grid md:grid-cols-2 gap-3">
              <div className="rounded border border-[#1a2d45] bg-[#060d18] p-4 text-xs">
                <p className="text-[#5a7a9a] mb-2 uppercase tracking-wider text-[10px]">EnterpriseLicenseNFT — Sepolia</p>
                <a
                  href="https://sepolia.etherscan.io/address/0x0ffFb771Ec41Ac7cE7A17f0c263e4B875fcB73eB"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[#4a8ecc] hover:underline break-all"
                >
                  0x0ffFb771Ec41Ac7cE7A17f0c263e4B875fcB73eB
                </a>
              </div>
              <div className="rounded border border-[#1a2d45] bg-[#060d18] p-4 text-xs">
                <p className="text-[#5a7a9a] mb-2 uppercase tracking-wider text-[10px]">ReportAccessNFT — Sepolia</p>
                <a
                  href="https://sepolia.etherscan.io/address/0xfEc8072a21489EE832B87b5dfDD60f9fF413Be75"
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[#4a8ecc] hover:underline break-all"
                >
                  0xfEc8072a21489EE832B87b5dfDD60f9fF413Be75
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── footer stats ── */}
        <div className="mt-12 pt-6 border-t border-[#0e1e30] grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-[#4a6a8a]">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1">Reports Available</p>
            <p className="font-mono text-[#7a98b8]">{CATALOG.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1">Chains Supported</p>
            <p className="font-mono text-[#7a98b8]">Sepolia · Celo Sepolia</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1">Payment</p>
            <p className="font-mono text-[#7a98b8]">ETH · Stable</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1">EIP-712 Attestation</p>
            <p className="font-mono text-[#7a98b8]">EvidenceAttestation.sol</p>
          </div>
        </div>

      </div>
      </main>
    </div>
  );
}
