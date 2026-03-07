"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import Topbar from "@/components/Topbar";
import DynamicTitle from "@/components/DynamicTitle";
import SvgDefs from "@/components/SvgDefs";
import AmbientLayer from "@/components/AmbientLayer";
import HexGridCanvas from "@/components/HexGridCanvas";
import CustomCursor from "@/components/CustomCursor";
import {
  BOUNTY_ESCROW_ABI,
  ENTERPRISE_LICENSE_NFT_ABI,
  ERC20_ABI,
  REPORT_ACCESS_NFT_ABI,
} from "@/lib/web3/abis";
import {
  CHAIN_LABEL,
  getContractsForChain,
  isContractsConfigured,
  type SupportedChain,
} from "@/lib/contracts";
import {
  DEFAULT_CHAIN_ID,
  SUPPORTED_CHAINS,
  type SupportedChainId,
} from "@/lib/web3/chains";

type TxState = {
  hash: string;
  label: string;
  chain: SupportedChain;
} | null;

type PriceState = {
  reportNative: string;
  reportStable: string;
  reportEnabled: boolean;
  planNative: string;
  planStable: string;
  planEnabled: boolean;
  stableSymbol: string;
};

type WalletNft = {
  chain: "sepolia" | "celo-sepolia";
  contractAddress: string;
  tokenId: string;
  name: string;
  collection: string;
  symbol: string;
  imageUrl: string;
  metadataUrl: string;
  traits: string[];
  explorerUrl: string;
  acquiredAt: string;
  source: "blockscout" | "etherscan";
};

type WalletTx = {
  chain: "sepolia" | "celo-sepolia";
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  symbol: string;
  status: "success" | "failed";
  kind: "native" | "token";
  explorerUrl: string;
  functionName: string;
};

type BountyRecord = {
  id: string;
  source: "wallet-local" | "explorer";
  chain: "sepolia" | "celo-sepolia";
  creator: string;
  txHash: string;
  txStatus: "success" | "failed";
  createdAtIso: string;
  deadlineIso: string;
  bountyType: "native" | "token";
  amount: string;
  symbol: string;
  title: string;
  scope: string;
  severity: "low" | "medium" | "high" | "critical";
  attachments: string[];
  explorerUrl: string;
};

const LOCAL_BOUNTY_VERSION = "v1";

const ZERO_PRICE: PriceState = {
  reportNative: "0.0000",
  reportStable: "0.00",
  reportEnabled: false,
  planNative: "0.0000",
  planStable: "0.00",
  planEnabled: false,
  stableSymbol: "USDC",
};

function seedNumber(value: string): number {
  return value.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function nftGradient(seed: string): string {
  const base = seedNumber(seed) % 360;
  const second = (base + 70) % 360;
  const third = (base + 150) % 360;
  return `linear-gradient(140deg, hsla(${base}, 92%, 54%, 0.42), hsla(${second}, 96%, 50%, 0.26), hsla(${third}, 90%, 52%, 0.35))`;
}

function shortHex(value: string, start = 6, end = 4): string {
  if (!value || value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function bountyStorageKey(address: string, chain: "sepolia" | "celo-sepolia") {
  return `vault-bounties:${LOCAL_BOUNTY_VERSION}:${chain}:${address.toLowerCase()}`;
}

function isoFromTimestampMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return new Date(0).toISOString();
  return new Date(value).toISOString();
}

function bountyStateFromDeadline(deadlineIso: string): "open" | "expired" {
  return Date.now() > new Date(deadlineIso).getTime() ? "expired" : "open";
}

function isLikelyImageAttachment(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/.test(lower) ||
    lower.includes("/image/upload/")
  );
}

function asSupportedChain(chainId: number | null): SupportedChainId | null {
  if (chainId === 11155111 || chainId === 11142220) return chainId;
  return null;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as {
      shortMessage?: string;
      reason?: string;
      message?: string;
    };
    return e.shortMessage || e.reason || e.message || "Transaction failed";
  }
  return "Transaction failed";
}

export default function VaultPage() {
  const {
    isActive,
    address,
    balance,
    chainId,
    preferredChainId,
    connectWallet,
    setPreferredChainId,
    switchChain,
  } = useWallet();

  const [reportKey, setReportKey] = useState("threat-report-premium-v1");
  const [planKey, setPlanKey] = useState("enterprise-pro-monthly");
  const [seats, setSeats] = useState("25");
  const [bountyAmount, setBountyAmount] = useState("0.05");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [bountyTitle, setBountyTitle] = useState("Flash-Loan Arbitrage Trace");
  const [bountyScope, setBountyScope] = useState(
    "Trace exploit wallet cluster and produce reproducible path.",
  );
  const [bountySeverity, setBountySeverity] = useState<
    "low" | "medium" | "high" | "critical"
  >("high");
  const [paymentMode, setPaymentMode] = useState<"native" | "stable">("native");
  const [isBusy, setIsBusy] = useState(false);
  const [txState, setTxState] = useState<TxState>(null);
  const [prices, setPrices] = useState<PriceState>(ZERO_PRICE);
  const [notification, setNotification] = useState<string | null>(null);
  const [nfts, setNfts] = useState<WalletNft[]>([]);
  const [nftLoading, setNftLoading] = useState(false);
  const [nftError, setNftError] = useState<string | null>(null);
  const [nftSearch, setNftSearch] = useState("");
  const [activeCollection, setActiveCollection] = useState<string>("all");
  const [selectedNft, setSelectedNft] = useState<WalletNft | null>(null);
  const [bountyAttachments, setBountyAttachments] = useState<string[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [bountyLoading, setBountyLoading] = useState(false);
  const [bountyError, setBountyError] = useState<string | null>(null);
  const [myBounties, setMyBounties] = useState<BountyRecord[]>([]);
  const myBountiesRef = useRef<HTMLDivElement | null>(null);

  const activeChain = useMemo<SupportedChain>(() => {
    return asSupportedChain(chainId) ?? preferredChainId ?? DEFAULT_CHAIN_ID;
  }, [chainId, preferredChainId]);

  const activeContracts = useMemo(
    () => getContractsForChain(activeChain),
    [activeChain],
  );
  const hasContractConfig = isContractsConfigured(activeContracts);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const getBrowserProvider = () => {
    if (typeof window === "undefined") return null;
    const eth = (window as Window & { ethereum?: ethers.Eip1193Provider })
      .ethereum;
    if (!eth) return null;
    return new ethers.BrowserProvider(eth);
  };

  const ensureWriteAccess = async () => {
    if (!isActive) {
      await connectWallet(preferredChainId);
    }

    const provider = getBrowserProvider();
    if (!provider) {
      throw new Error("Wallet provider unavailable");
    }

    let network = await provider.getNetwork();
    let selectedChain = Number(network.chainId);

    if (selectedChain !== preferredChainId) {
      const switched = await switchChain(preferredChainId);
      if (!switched) {
        throw new Error("Please switch chain in wallet");
      }
      network = await provider.getNetwork();
      selectedChain = Number(network.chainId);
    }

    const supported = asSupportedChain(selectedChain);
    if (!supported) {
      throw new Error("Unsupported chain selected");
    }

    const chainContracts = getContractsForChain(supported);
    if (!isContractsConfigured(chainContracts)) {
      throw new Error(
        `Contracts are not configured for ${CHAIN_LABEL[supported]}`,
      );
    }

    const signer = await provider.getSigner();
    return { provider, signer, chain: supported, chainContracts };
  };

  const awaitTx = async (
    label: string,
    chain: SupportedChain,
    tx: ethers.ContractTransactionResponse,
  ) => {
    setTxState({ hash: tx.hash, label, chain });
    await tx.wait();
    showNotification(`${label} confirmed on ${CHAIN_LABEL[chain]}`);
  };

  const loadLivePricing = useCallback(async () => {
    if (!isActive || !hasContractConfig) {
      setPrices(ZERO_PRICE);
      return;
    }

    try {
      const provider = getBrowserProvider();
      if (!provider) return;

      const contracts = getContractsForChain(activeChain);
      const report = new Contract(
        contracts.reportAccessNFT,
        REPORT_ACCESS_NFT_ABI,
        provider,
      );
      const enterprise = new Contract(
        contracts.enterpriseLicenseNFT,
        ENTERPRISE_LICENSE_NFT_ABI,
        provider,
      );
      const stable = new Contract(contracts.stableToken, ERC20_ABI, provider);

      const reportId = ethers.id(reportKey.trim());
      const planId = ethers.id(planKey.trim());

      const [reportPricing, planPricing, stableSymbol] = await Promise.all([
        report.pricing(reportId),
        enterprise.plans(planId),
        stable.symbol(),
      ]);

      setPrices({
        reportNative: ethers.formatEther(reportPricing.nativePrice as bigint),
        reportStable: ethers.formatUnits(
          reportPricing.stablePrice as bigint,
          6,
        ),
        reportEnabled: Boolean(reportPricing.enabled),
        planNative: ethers.formatEther(planPricing.nativePrice as bigint),
        planStable: ethers.formatUnits(planPricing.stablePrice as bigint, 6),
        planEnabled: Boolean(planPricing.enabled),
        stableSymbol: String(stableSymbol || "USDC"),
      });
    } catch {
      // Keep UI usable even when plan/report IDs are not configured on-chain yet.
      setPrices(ZERO_PRICE);
    }
  }, [activeChain, hasContractConfig, isActive, planKey, reportKey]);

  useEffect(() => {
    loadLivePricing();
  }, [loadLivePricing]);

  const chainSlug: "sepolia" | "celo-sepolia" =
    activeChain === 11155111 ? "sepolia" : "celo-sepolia";

  const loadWalletNfts = useCallback(async () => {
    if (!isActive || !address) {
      setNfts([]);
      setSelectedNft(null);
      setNftError(null);
      return;
    }

    setNftLoading(true);
    setNftError(null);
    try {
      const res = await fetch(
        `/api/web3/nfts?address=${address}&chain=${chainSlug}&limit=36`,
        {
          cache: "no-store",
        },
      );

      if (!res.ok) {
        throw new Error(`NFT listing failed (${res.status})`);
      }

      const data = (await res.json()) as { nfts?: WalletNft[] };
      const items = Array.isArray(data.nfts) ? data.nfts : [];
      setNfts(items);
      setSelectedNft((prev) => {
        if (!items.length) return null;
        if (!prev) return items[0];
        return (
          items.find(
            (n) =>
              n.contractAddress === prev.contractAddress &&
              n.tokenId === prev.tokenId,
          ) || items[0]
        );
      });
    } catch (error) {
      setNftError(extractErrorMessage(error));
      setNfts([]);
      setSelectedNft(null);
    } finally {
      setNftLoading(false);
    }
  }, [address, chainSlug, isActive]);

  useEffect(() => {
    void loadWalletNfts();
  }, [loadWalletNfts]);

  const persistLocalBounty = useCallback(
    (record: BountyRecord) => {
      if (typeof window === "undefined") return;
      const key = bountyStorageKey(record.creator, record.chain);
      const existingRaw = window.localStorage.getItem(key);
      const existing = existingRaw
        ? ((JSON.parse(existingRaw) as BountyRecord[]) || [])
        : [];

      const merged = [record, ...existing.filter((b) => b.txHash !== record.txHash)];
      window.localStorage.setItem(key, JSON.stringify(merged.slice(0, 120)));
    },
    [],
  );

  const uploadEvidenceToCloudinary = useCallback(
    async (file: File) => {
      if (!file) return;
      setUploadingEvidence(true);
      try {
        const signRes = await fetch("/api/cloudinary/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: `vault-bounties/${chainSlug}` }),
        });

        if (!signRes.ok) {
          throw new Error("Cloudinary signature unavailable. Configure server env.");
        }

        const sign = (await signRes.json()) as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          folder: string;
        };

        const body = new FormData();
        body.append("file", file);
        body.append("api_key", sign.apiKey);
        body.append("timestamp", String(sign.timestamp));
        body.append("signature", sign.signature);
        body.append("folder", sign.folder);

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`,
          {
            method: "POST",
            body,
          },
        );

        if (!uploadRes.ok) {
          throw new Error("Cloudinary upload failed");
        }

        const uploaded = (await uploadRes.json()) as { secure_url?: string };
        if (!uploaded.secure_url) {
          throw new Error("Upload did not return an asset URL");
        }

        setBountyAttachments((prev) => [uploaded.secure_url as string, ...prev]);
        showNotification("Evidence uploaded to Cloudinary");
      } catch (error) {
        showNotification(extractErrorMessage(error));
      } finally {
        setUploadingEvidence(false);
      }
    },
    [chainSlug],
  );

  const loadMyBounties = useCallback(async () => {
    if (!isActive || !address) {
      setMyBounties([]);
      setBountyError(null);
      return;
    }

    setBountyLoading(true);
    setBountyError(null);
    try {
      const key = bountyStorageKey(address, chainSlug);
      const localRaw =
        typeof window === "undefined" ? null : window.localStorage.getItem(key);
      const localItems = localRaw
        ? ((JSON.parse(localRaw) as BountyRecord[]) || [])
        : [];

      const response = await fetch(
        `/api/web3/transactions?address=${address}&chain=${chainSlug}&limit=120`,
        { cache: "no-store" },
      );

      const txData = response.ok
        ? ((await response.json()) as { txs?: WalletTx[] })
        : { txs: [] };
      const txs = Array.isArray(txData.txs) ? txData.txs : [];

      const escrow = activeContracts.bountyEscrow.toLowerCase();
      const wallet = address.toLowerCase();

      const explorerDerived: BountyRecord[] = txs
        .filter((tx) => {
          const fn = (tx.functionName || "").toLowerCase();
          return (
            tx.from.toLowerCase() === wallet &&
            tx.to.toLowerCase() === escrow &&
            (fn.includes("createnativebounty") || fn.includes("createtokenbounty"))
          );
        })
        .map((tx, idx) => ({
          id: `explorer-${tx.hash}-${idx}`,
          source: "explorer",
          chain: chainSlug,
          creator: address,
          txHash: tx.hash,
          txStatus: tx.status,
          createdAtIso: isoFromTimestampMs(tx.timestamp),
          deadlineIso: new Date(tx.timestamp + 24 * 3600 * 1000).toISOString(),
          bountyType: (tx.functionName || "").toLowerCase().includes("token")
            ? "token"
            : "native",
          amount: tx.value,
          symbol: tx.symbol,
          title: "On-chain bounty create",
          scope: "Imported from explorer activity",
          severity: "medium",
          attachments: [],
          explorerUrl: tx.explorerUrl,
        }));

      const merged = new Map<string, BountyRecord>();
      for (const b of [...localItems, ...explorerDerived]) {
        merged.set(b.txHash, b);
      }

      const normalized = Array.from(merged.values()).sort(
        (a, b) =>
          new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
      );

      setMyBounties(normalized);
    } catch (error) {
      setBountyError(extractErrorMessage(error));
      setMyBounties([]);
    } finally {
      setBountyLoading(false);
    }
  }, [activeContracts.bountyEscrow, address, chainSlug, isActive]);

  useEffect(() => {
    void loadMyBounties();
  }, [loadMyBounties]);

  const handleBuyReport = async () => {
    setIsBusy(true);
    try {
      const { signer, chain, chainContracts } = await ensureWriteAccess();
      const buyer = await signer.getAddress();
      const reportId = ethers.id(reportKey.trim());
      const report = new Contract(
        chainContracts.reportAccessNFT,
        REPORT_ACCESS_NFT_ABI,
        signer,
      );
      const stable = new Contract(
        chainContracts.stableToken,
        ERC20_ABI,
        signer,
      );
      const pricing = await report.pricing(reportId);

      if (!pricing.enabled) {
        throw new Error("Report not enabled by admin");
      }

      if (paymentMode === "native") {
        if ((pricing.nativePrice as bigint) === BigInt(0)) {
          throw new Error("Native payment disabled for this report");
        }
        const tx = await report.buyWithNative(reportId, buyer, {
          value: pricing.nativePrice,
        });
        await awaitTx("Report purchase", chain, tx);
      } else {
        if ((pricing.stablePrice as bigint) === BigInt(0)) {
          throw new Error("Stable payment disabled for this report");
        }

        const allowance = await stable.allowance(
          buyer,
          chainContracts.reportAccessNFT,
        );
        if ((allowance as bigint) < (pricing.stablePrice as bigint)) {
          const approveTx = await stable.approve(
            chainContracts.reportAccessNFT,
            pricing.stablePrice,
          );
          await awaitTx("Stable approval", chain, approveTx);
        }

        const tx = await report.buyWithStable(reportId, buyer);
        await awaitTx("Report purchase", chain, tx);
      }
    } catch (error) {
      showNotification(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
      loadLivePricing();
    }
  };

  const handleBuyLicense = async () => {
    setIsBusy(true);
    try {
      const parsedSeats = Number(seats);
      if (!Number.isInteger(parsedSeats) || parsedSeats < 1) {
        throw new Error("Seats must be a positive integer");
      }

      const { signer, chain, chainContracts } = await ensureWriteAccess();
      const buyer = await signer.getAddress();
      const planId = ethers.id(planKey.trim());
      const enterprise = new Contract(
        chainContracts.enterpriseLicenseNFT,
        ENTERPRISE_LICENSE_NFT_ABI,
        signer,
      );
      const stable = new Contract(
        chainContracts.stableToken,
        ERC20_ABI,
        signer,
      );
      const plan = await enterprise.plans(planId);

      if (!plan.enabled) {
        throw new Error("Plan not enabled by admin");
      }

      if (paymentMode === "native") {
        if ((plan.nativePrice as bigint) === BigInt(0)) {
          throw new Error("Native payment disabled for this plan");
        }

        const tx = await enterprise.buyWithNative(planId, buyer, parsedSeats, {
          value: plan.nativePrice,
        });
        await awaitTx("License purchase", chain, tx);
      } else {
        if ((plan.stablePrice as bigint) === BigInt(0)) {
          throw new Error("Stable payment disabled for this plan");
        }

        const allowance = await stable.allowance(
          buyer,
          chainContracts.enterpriseLicenseNFT,
        );
        if ((allowance as bigint) < (plan.stablePrice as bigint)) {
          const approveTx = await stable.approve(
            chainContracts.enterpriseLicenseNFT,
            plan.stablePrice,
          );
          await awaitTx("Stable approval", chain, approveTx);
        }

        const tx = await enterprise.buyWithStable(planId, buyer, parsedSeats);
        await awaitTx("License purchase", chain, tx);
      }
    } catch (error) {
      showNotification(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
      loadLivePricing();
    }
  };

  const handleCreateBounty = async () => {
    setIsBusy(true);
    try {
      const amount = Number(bountyAmount);
      const hours = Number(deadlineHours);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Bounty amount must be > 0");
      }
      if (!Number.isInteger(hours) || hours < 1) {
        throw new Error("Deadline hours must be >= 1");
      }

      const { signer, chain, chainContracts } = await ensureWriteAccess();
      const escrow = new Contract(
        chainContracts.bountyEscrow,
        BOUNTY_ESCROW_ABI,
        signer,
      );
      const stable = new Contract(
        chainContracts.stableToken,
        ERC20_ABI,
        signer,
      );
      const deadline = BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
      const deadlineIso = new Date(Number(deadline) * 1000).toISOString();
      const creator = await signer.getAddress();
      let createdHash = "";
      let createdType: "native" | "token" =
        paymentMode === "native" ? "native" : "token";
      const createdAmount = bountyAmount;
      let createdSymbol = paymentMode === "native" ? "NATIVE" : prices.stableSymbol;

      if (paymentMode === "native") {
        const value = ethers.parseEther(bountyAmount);
        const tx = await escrow.createNativeBounty(deadline, { value });
        createdHash = tx.hash;
        createdSymbol = chain === 11142220 ? "CELO" : "ETH";
        await awaitTx("Bounty creation", chain, tx);
      } else {
        const decimals = Number(await stable.decimals());
        const tokenAmount = ethers.parseUnits(bountyAmount, decimals);
        const allowance = await stable.allowance(
          creator,
          chainContracts.bountyEscrow,
        );
        if ((allowance as bigint) < tokenAmount) {
          const approveTx = await stable.approve(
            chainContracts.bountyEscrow,
            tokenAmount,
          );
          await awaitTx("Stable approval", chain, approveTx);
        }

        const tx = await escrow.createTokenBounty(
          chainContracts.stableToken,
          tokenAmount,
          deadline,
        );
        createdHash = tx.hash;
        createdType = "token";
        await awaitTx("Bounty creation", chain, tx);
      }

      if (createdHash) {
        const local: BountyRecord = {
          id: `wallet-local-${Date.now()}-${createdHash}`,
          source: "wallet-local",
          chain: chainSlug,
          creator,
          txHash: createdHash,
          txStatus: "success",
          createdAtIso: new Date().toISOString(),
          deadlineIso,
          bountyType: createdType,
          amount: createdAmount,
          symbol: createdSymbol,
          title: bountyTitle.trim() || "Untitled bounty",
          scope: bountyScope.trim() || "No scope provided",
          severity: bountySeverity,
          attachments: bountyAttachments,
          explorerUrl: `${explorerBase}/tx/${createdHash}`,
        };
        persistLocalBounty(local);
        showNotification("Bounty created and indexed in My Bounties");
      }
    } catch (error) {
      showNotification(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
      void loadMyBounties();
    }
  };

  const explorerBase = SUPPORTED_CHAINS[activeChain].blockExplorerUrls[0];

  const collections = useMemo(() => {
    const names = Array.from(new Set(nfts.map((n) => n.collection))).sort();
    return ["all", ...names];
  }, [nfts]);

  const filteredNfts = useMemo(() => {
    const query = nftSearch.trim().toLowerCase();
    return nfts.filter((nft) => {
      const passCollection =
        activeCollection === "all" || nft.collection === activeCollection;
      if (!passCollection) return false;
      if (!query) return true;
      const hay = `${nft.name} ${nft.collection} ${nft.symbol} ${nft.tokenId}`.toLowerCase();
      return hay.includes(query);
    });
  }, [activeCollection, nftSearch, nfts]);

  const fireTrap = async (vector: string) => {
    try {
      await fetch("/api/trap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exploit_vector: vector,
          address: address || "unconnected",
          balance: balance || "0",
          timestamp: new Date().toISOString(),
        }),
      });
      // Deliberately opaque generic error message to confuse the attacker
      showNotification("JSON-RPC Error: execution reverted");
    } catch (e) {
      console.error(e);
    }
  };

  const jumpToMyBounties = () => {
    myBountiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#05050A] font-mono text-[var(--text-dim)]">
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

        <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8 custom-scrollbar">
          {/* In-page notification toast */}
          {notification && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#0b0c10] border border-[#FF003C] text-[#FF003C] text-xs tracking-widest px-6 py-3 font-mono shadow-[0_0_20px_rgba(255,0,60,0.3)] animate-pulse">
              ⚠ {notification}
            </div>
          )}

          {/* The Honey-Vault UI */}
          <div className="max-w-6xl mx-auto w-full space-y-6">
            {txState && (
              <div className="border border-[#00FFD1]/40 bg-[#051116] px-4 py-3 text-xs tracking-widest">
                <span className="text-[#00FFD1]">TX:</span> {txState.label} on{" "}
                {CHAIN_LABEL[txState.chain]}
                <a
                  className="text-[var(--accent-magenta)] ml-2 underline"
                  href={`${
                    SUPPORTED_CHAINS[txState.chain].blockExplorerUrls[0]
                  }/tx/${txState.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {txState.hash.slice(0, 12)}...{txState.hash.slice(-10)}
                </a>
              </div>
            )}

            <div className="text-center mb-12">
              <h1 className="text-5xl font-bold tracking-[0.3em] text-white">
                LIQUIDITY VAULT
              </h1>
              <p className="text-[#00FFD1] mt-4 uppercase tracking-[0.2em]">
                ACTIVE CHAIN: {CHAIN_LABEL[activeChain]} | WALLET:{" "}
                {balance || "0.0000"}
              </p>
              <p className="text-[#888] mt-2 text-xs tracking-widest uppercase">
                Real contract mode: report purchase, enterprise license, and
                bounty escrow
              </p>
              <div className="mt-5">
                <button
                  onClick={jumpToMyBounties}
                  className="px-5 py-2 text-xs tracking-[0.2em] uppercase border border-[#00FFD1] text-[#00FFD1] hover:bg-[#00FFD1] hover:text-black transition-colors"
                >
                  My Bounties
                </button>
              </div>
            </div>

            <div className="bg-[#0b0c10]/80 border border-[#222] p-4 flex flex-wrap items-center gap-3">
              <span className="text-xs tracking-widest text-[#888] uppercase mr-2">
                Preferred Chain
              </span>
              <button
                onClick={() => setPreferredChainId(11142220)}
                className={`px-3 py-2 text-xs tracking-widest border ${
                  preferredChainId === 11142220
                    ? "border-[#00FFD1] text-[#00FFD1] bg-[#00FFD1]/10"
                    : "border-[#333] text-[#aaa]"
                }`}
              >
                CELO SEPOLIA
              </button>
              <button
                onClick={() => setPreferredChainId(11155111)}
                className={`px-3 py-2 text-xs tracking-widest border ${
                  preferredChainId === 11155111
                    ? "border-[#00FFD1] text-[#00FFD1] bg-[#00FFD1]/10"
                    : "border-[#333] text-[#aaa]"
                }`}
              >
                SEPOLIA
              </button>
              <button
                onClick={() => switchChain(preferredChainId)}
                className="px-3 py-2 text-xs tracking-widest border border-[var(--accent-magenta)] text-[var(--accent-magenta)] hover:text-white"
              >
                SWITCH IN WALLET
              </button>
              {!hasContractConfig && (
                <span className="text-[#FF8A00] text-[10px] tracking-widest uppercase">
                  Contract addresses missing for {CHAIN_LABEL[activeChain]} |
                  run deploy + sync env
                </span>
              )}
            </div>

            <section className="relative bg-[#080a12]/85 border border-[#1b2230] p-6 md:p-8 overflow-hidden shadow-[0_0_60px_rgba(0,255,209,0.06)]">
              <div className="absolute inset-0 opacity-30 pointer-events-none">
                <div className="absolute -top-10 -right-20 w-72 h-72 rounded-full blur-3xl bg-[rgba(0,255,209,0.12)]" />
                <div className="absolute -bottom-16 -left-24 w-72 h-72 rounded-full blur-3xl bg-[rgba(255,0,255,0.12)]" />
              </div>

              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1e2633] pb-5">
                  <div>
                    <p className="text-[10px] tracking-[0.28em] uppercase text-[#6f7d96]">
                      Live Wallet Inventory
                    </p>
                    <h3 className="text-2xl md:text-3xl text-white tracking-[0.18em] uppercase mt-1">
                      NFT Arsenal
                    </h3>
                    <p className="text-[11px] text-[#92a0b8] mt-2 tracking-wide">
                      Real chain index of your owned NFTs on {CHAIN_LABEL[activeChain]}.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] tracking-[0.22em] uppercase text-[#5e6c86]">
                        Total Owned
                      </p>
                      <p className="text-xl text-[#00FFD1] tracking-[0.12em] font-bold">
                        {nfts.length}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        void loadWalletNfts();
                      }}
                      className="px-3 py-2 text-[10px] tracking-[0.2em] uppercase border border-[#2d4e63] text-[#9dd6ff] hover:text-white hover:border-[#79d6ff] transition-colors"
                    >
                      Refresh Index
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={nftSearch}
                    onChange={(e) => setNftSearch(e.target.value)}
                    placeholder="Search by collection, symbol, token id"
                    className="flex-1 min-w-[220px] bg-[#05070d] border border-[#223049] px-3 py-2 text-xs text-[#dbe7ff] placeholder:text-[#5b6780] tracking-wide"
                  />

                  <div className="flex flex-wrap gap-2">
                    {collections.map((collection) => (
                      <button
                        key={collection}
                        onClick={() => setActiveCollection(collection)}
                        className={`px-2.5 py-1.5 text-[10px] tracking-[0.18em] uppercase border transition-colors ${
                          activeCollection === collection
                            ? "border-[#00FFD1] text-[#00FFD1] bg-[#00FFD1]/10"
                            : "border-[#2a3346] text-[#8d9ab2] hover:text-white"
                        }`}
                      >
                        {collection === "all" ? "ALL" : collection}
                      </button>
                    ))}
                  </div>
                </div>

                {nftError && (
                  <div className="border border-[#5f1d2c] bg-[#2b0f16] px-4 py-3 text-xs tracking-wide text-[#ff9fb1]">
                    {nftError}
                  </div>
                )}

                {nftLoading ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={`nft-skeleton-${i}`}
                        className="h-52 border border-[#1f293a] bg-[#070b12] animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredNfts.length === 0 ? (
                  <div className="border border-dashed border-[#283246] bg-[#060a12] px-4 py-8 text-center text-[#7c8ca7] text-xs tracking-[0.15em] uppercase">
                    No NFTs indexed for this wallet on this chain yet.
                  </div>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredNfts.map((nft) => {
                        const isSelected =
                          selectedNft?.contractAddress === nft.contractAddress &&
                          selectedNft?.tokenId === nft.tokenId;
                        const visualSeed = `${nft.contractAddress}:${nft.tokenId}`;

                        return (
                          <button
                            type="button"
                            key={`${nft.contractAddress}:${nft.tokenId}`}
                            onClick={() => setSelectedNft(nft)}
                            className={`group text-left border p-3 transition-all hover:-translate-y-1 ${
                              isSelected
                                ? "border-[#00FFD1] bg-[#0a1117] shadow-[0_0_24px_rgba(0,255,209,0.18)]"
                                : "border-[#1f2a3a] bg-[#070b12] hover:border-[#3b4e68]"
                            }`}
                          >
                            <div className="relative h-28 border border-[#2b3a52] overflow-hidden">
                              {nft.imageUrl ? (
                                <img
                                  src={nft.imageUrl}
                                  alt={nft.name}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center text-[#d9e4ff] text-xs tracking-[0.18em] font-bold"
                                  style={{ background: nftGradient(visualSeed) }}
                                >
                                  {nft.symbol}
                                </div>
                              )}
                              <div className="absolute top-2 left-2 text-[9px] px-2 py-1 tracking-widest bg-black/55 border border-[#385278] text-[#9dd6ff] uppercase">
                                #{nft.tokenId}
                              </div>
                            </div>

                            <div className="mt-3 space-y-1.5">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[#6f809f]">
                                {nft.collection}
                              </p>
                              <p className="text-sm text-white truncate tracking-wide">
                                {nft.name}
                              </p>
                              <p className="text-[10px] text-[#7e90ad] tracking-wide">
                                {shortHex(nft.contractAddress, 8, 6)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedNft && (
                      <div className="border border-[#22344a] bg-[#060b12] p-4 md:p-5 grid md:grid-cols-[180px,1fr] gap-5 items-start">
                        <div className="h-40 border border-[#304b6a] overflow-hidden">
                          {selectedNft.imageUrl ? (
                            <img
                              src={selectedNft.imageUrl}
                              alt={selectedNft.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white tracking-[0.2em] text-xs font-bold"
                              style={{
                                background: nftGradient(
                                  `${selectedNft.contractAddress}:${selectedNft.tokenId}`,
                                ),
                              }}
                            >
                              {selectedNft.symbol}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8fa2c4]">
                              {selectedNft.collection}
                            </p>
                            <h4 className="text-xl text-white tracking-wide mt-1">
                              {selectedNft.name}
                            </h4>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-2 text-[11px] text-[#a7b7d0]">
                            <p>
                              Token ID: <span className="text-[#00FFD1]">#{selectedNft.tokenId}</span>
                            </p>
                            <p>
                              Source: <span className="text-[#9dd6ff] uppercase">{selectedNft.source}</span>
                            </p>
                            <p className="sm:col-span-2">
                              Contract: <span className="text-[#dce8ff]">{shortHex(selectedNft.contractAddress, 10, 8)}</span>
                            </p>
                          </div>

                          {selectedNft.traits.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {selectedNft.traits.slice(0, 6).map((trait) => (
                                <span
                                  key={trait}
                                  className="px-2 py-1 text-[10px] tracking-wide border border-[#2f4969] bg-[#0b1521] text-[#bcd5ff]"
                                >
                                  {trait}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <a
                              href={selectedNft.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 text-[10px] tracking-[0.2em] uppercase border border-[#00FFD1] text-[#00FFD1] hover:bg-[#00FFD1] hover:text-black transition-colors"
                            >
                              Open Explorer
                            </a>
                            {selectedNft.metadataUrl && (
                              <a
                                href={selectedNft.metadataUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-2 text-[10px] tracking-[0.2em] uppercase border border-[#3b4f66] text-[#b8c7df] hover:text-white"
                              >
                                Metadata
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            <div className="bg-[#0b0c10]/80 backdrop-blur-xl border border-[#222] p-10 relative overflow-hidden shadow-[0_0_50px_rgba(0,255,209,0.05)]">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#00FFD1] opacity-50" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#00FFD1] opacity-50" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#00FFD1] opacity-50" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#00FFD1] opacity-50" />

              <div className="flex flex-wrap items-center justify-between mb-6 border-b border-[#222] pb-6 gap-3">
                <div>
                  <h3 className="text-xl text-white font-bold tracking-widest uppercase">
                    Commerce Controls
                  </h3>
                  <p className="text-xs text-[#666] mt-1">
                    Choose payment mode once, then execute report/license/bounty
                    actions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaymentMode("native")}
                    className={`px-3 py-1 text-xs tracking-widest border ${
                      paymentMode === "native"
                        ? "border-[#00FFD1] text-[#00FFD1]"
                        : "border-[#333] text-[#999]"
                    }`}
                  >
                    NATIVE
                  </button>
                  <button
                    onClick={() => setPaymentMode("stable")}
                    className={`px-3 py-1 text-xs tracking-widest border ${
                      paymentMode === "stable"
                        ? "border-[#00FFD1] text-[#00FFD1]"
                        : "border-[#333] text-[#999]"
                    }`}
                  >
                    {prices.stableSymbol}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="border border-[#222] p-5 space-y-3">
                  <h4 className="text-white tracking-widest uppercase text-sm">
                    Buy Threat Report NFT
                  </h4>
                  <input
                    value={reportKey}
                    onChange={(e) => setReportKey(e.target.value)}
                    className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                    placeholder="report key"
                  />
                  <p className="text-[11px] text-[#888]">
                    Price:{" "}
                    {paymentMode === "native"
                      ? `${prices.reportNative} Native`
                      : `${prices.reportStable} ${prices.stableSymbol}`}
                    {" | "}
                    Status: {prices.reportEnabled ? "Enabled" : "Disabled"}
                  </p>
                  <button
                    onClick={handleBuyReport}
                    disabled={isBusy}
                    className="w-full py-2 border border-[#00FFD1] text-[#00FFD1] hover:bg-[#00FFD1] hover:text-black text-xs tracking-widest"
                  >
                    {isBusy ? "PROCESSING..." : "BUY REPORT ACCESS"}
                  </button>
                </div>

                <div className="border border-[#222] p-5 space-y-3">
                  <h4 className="text-white tracking-widest uppercase text-sm">
                    Buy Enterprise License
                  </h4>
                  <input
                    value={planKey}
                    onChange={(e) => setPlanKey(e.target.value)}
                    className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                    placeholder="plan key"
                  />
                  <input
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                    placeholder="seats"
                  />
                  <p className="text-[11px] text-[#888]">
                    Price:{" "}
                    {paymentMode === "native"
                      ? `${prices.planNative} Native`
                      : `${prices.planStable} ${prices.stableSymbol}`}
                    {" | "}
                    Status: {prices.planEnabled ? "Enabled" : "Disabled"}
                  </p>
                  <button
                    onClick={handleBuyLicense}
                    disabled={isBusy}
                    className="w-full py-2 border border-[#00FFD1] text-[#00FFD1] hover:bg-[#00FFD1] hover:text-black text-xs tracking-widest"
                  >
                    {isBusy ? "PROCESSING..." : "BUY ENTERPRISE LICENSE"}
                  </button>
                </div>

                <div className="border border-[#222] p-5 space-y-3 md:col-span-2">
                  <h4 className="text-white tracking-widest uppercase text-sm">
                    Create Bounty Escrow
                  </h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      value={bountyTitle}
                      onChange={(e) => setBountyTitle(e.target.value)}
                      className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                      placeholder="bounty title"
                    />
                    <select
                      value={bountySeverity}
                      onChange={(e) =>
                        setBountySeverity(
                          e.target.value as "low" | "medium" | "high" | "critical",
                        )
                      }
                      className="w-full bg-black border border-[#333] px-3 py-2 text-sm uppercase"
                    >
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL</option>
                    </select>
                  </div>
                  <textarea
                    value={bountyScope}
                    onChange={(e) => setBountyScope(e.target.value)}
                    className="w-full min-h-[92px] bg-black border border-[#333] px-3 py-2 text-sm"
                    placeholder="bounty scope / mission objective"
                  />
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      value={bountyAmount}
                      onChange={(e) => setBountyAmount(e.target.value)}
                      className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                      placeholder={`amount (${
                        paymentMode === "native"
                          ? "native"
                          : prices.stableSymbol
                      })`}
                    />
                    <input
                      value={deadlineHours}
                      onChange={(e) => setDeadlineHours(e.target.value)}
                      className="w-full bg-black border border-[#333] px-3 py-2 text-sm"
                      placeholder="deadline in hours"
                    />
                  </div>
                  <div className="border border-[#243547] bg-[#070d14] p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] tracking-wider text-[#9ab4d6] uppercase">
                        Evidence Attachments (Cloudinary)
                      </p>
                      <label className="text-[10px] px-3 py-1 border border-[#3c5a79] text-[#9fd3ff] cursor-pointer hover:text-white">
                        {uploadingEvidence ? "UPLOADING..." : "UPLOAD FILE"}
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*,.pdf,.json,.txt"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              void uploadEvidenceToCloudinary(file);
                            }
                            e.currentTarget.value = "";
                          }}
                          disabled={uploadingEvidence}
                        />
                      </label>
                    </div>

                    {bountyAttachments.length === 0 ? (
                      <p className="text-[10px] text-[#6f829d] tracking-widest uppercase">
                        No evidence uploaded yet.
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {bountyAttachments.map((url, idx) => (
                          <a
                            key={`${url}-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] px-2 py-2 border border-[#2d4967] bg-[#09121d] text-[#b9dbff] hover:text-white truncate"
                          >
                            {shortHex(url, 22, 10)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCreateBounty}
                    disabled={isBusy}
                    className="w-full py-2 border border-[var(--accent-magenta)] text-[var(--accent-magenta)] hover:bg-[var(--accent-magenta)] hover:text-black text-xs tracking-widest"
                  >
                    {isBusy ? "PROCESSING..." : "CREATE BOUNTY"}
                  </button>
                  <button
                    onClick={jumpToMyBounties}
                    className="w-full py-2 border border-[#2f4864] text-[#9dd6ff] hover:text-white text-xs tracking-widest"
                  >
                    VIEW MY BOUNTIES
                  </button>
                  <p className="text-[10px] text-[#666]">
                    Explorer:{" "}
                    <a
                      className="underline"
                      href={explorerBase}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {explorerBase}
                    </a>
                  </p>
                </div>

                <div
                  ref={myBountiesRef}
                  id="my-bounties"
                  className="border border-[#243247] p-5 space-y-3 md:col-span-2 bg-[#070a11]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-white tracking-widest uppercase text-sm">
                      My Bounties
                    </h4>
                    <button
                      onClick={() => {
                        void loadMyBounties();
                      }}
                      className="px-3 py-1 text-[10px] tracking-[0.18em] uppercase border border-[#2f4864] text-[#9dd6ff] hover:text-white"
                    >
                      Refresh
                    </button>
                  </div>

                  {bountyError && (
                    <div className="border border-[#5d1b2d] bg-[#2a1018] px-3 py-2 text-xs text-[#ff9fb4]">
                      {bountyError}
                    </div>
                  )}

                  {bountyLoading ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={`bounty-skeleton-${i}`}
                          className="h-24 border border-[#1f2a3a] bg-[#060b12] animate-pulse"
                        />
                      ))}
                    </div>
                  ) : myBounties.length === 0 ? (
                    <p className="text-[11px] text-[#7085a6] tracking-[0.15em] uppercase border border-dashed border-[#2a3a50] px-4 py-6 text-center">
                      No bounty transactions detected yet for this wallet.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {myBounties.map((bounty) => {
                        const runtimeState = bountyStateFromDeadline(bounty.deadlineIso);
                        return (
                          <article
                            key={bounty.id}
                            className="border border-[#243247] bg-[#060b12] p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[10px] tracking-[0.2em] uppercase text-[#7f95b5]">
                                  {bounty.title}
                                </p>
                                <p className="text-[11px] text-white mt-1">
                                  {bounty.amount} {bounty.symbol}
                                </p>
                              </div>
                              <span
                                className={`px-2 py-1 text-[9px] uppercase tracking-[0.15em] border ${
                                  runtimeState === "open"
                                    ? "border-[#00FFD1] text-[#00FFD1]"
                                    : "border-[#ff8a6a] text-[#ff8a6a]"
                                }`}
                              >
                                {runtimeState}
                              </span>
                            </div>

                            <p className="text-[10px] text-[#8ba2c5] line-clamp-2">
                              {bounty.scope}
                            </p>

                            <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em]">
                              <span className="px-2 py-1 border border-[#2d425b] text-[#8dbdf0]">
                                {bounty.bountyType}
                              </span>
                              <span className="px-2 py-1 border border-[#3f355f] text-[#c2a8ff]">
                                {bounty.severity}
                              </span>
                              <span className="px-2 py-1 border border-[#2a3f3f] text-[#9ad6c2]">
                                {bounty.txStatus}
                              </span>
                            </div>

                            <div className="text-[10px] text-[#6f84a4]">
                              Created: {new Date(bounty.createdAtIso).toLocaleString()}
                            </div>
                            <div className="text-[10px] text-[#6f84a4]">
                              Deadline: {new Date(bounty.deadlineIso).toLocaleString()}
                            </div>

                            <div className="flex flex-wrap gap-2 items-center">
                              <a
                                href={bounty.explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] px-2 py-1 border border-[#2a4f5f] text-[#98d8ff] hover:text-white"
                              >
                                {shortHex(bounty.txHash, 10, 8)}
                              </a>
                              {bounty.attachments.length > 0 && (
                                <span className="text-[10px] text-[#8eb3d4]">
                                  {bounty.attachments.length} attachment(s)
                                </span>
                              )}
                            </div>

                            {bounty.attachments.length > 0 && (
                              <div className="grid grid-cols-3 gap-2 mt-1">
                                {bounty.attachments.slice(0, 3).map((url, idx) => {
                                  const imageLike = isLikelyImageAttachment(url);
                                  return (
                                    <a
                                      key={`${bounty.id}-attachment-${idx}`}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="group border border-[#2d4967] bg-[#09121d] h-16 overflow-hidden"
                                      title="Open attachment"
                                    >
                                      {imageLike ? (
                                        <img
                                          src={url}
                                          alt={`Bounty attachment ${idx + 1}`}
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[9px] tracking-[0.15em] uppercase text-[#9fc7eb]">
                                          FILE
                                        </div>
                                      )}
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================= 
                            HONEYPOT TRAP: Intentional vulnerability disguised as an 
                            accidental developer console leak 
                           ========================================================= */}
            <div className="mt-12 opacity-0 hover:opacity-100 transition-opacity flex justify-center group focus-within:opacity-100">
              {/* We write "Admin Config (debug)" in tiny gray text deep below the fold to trick automated DOM scrapers and curious hackers looking for flaws */}
              <div className="text-center max-w-sm w-full">
                <p className="text-[9px] text-[#444] tracking-widest uppercase mb-2">
                  {"// Dev Debug Panel"}
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => fireTrap("emergency_withdraw_arbitrage")}
                    className="text-[10px] bg-[#111] border border-[#222] text-[#555] px-3 py-1 hover:border-[#FF003C] hover:text-[#FF003C] transition-colors"
                  >
                    triggerEmergencyWithdraw()
                  </button>
                  <button
                    onClick={() => fireTrap("override_contract_owner")}
                    className="text-[10px] bg-[#111] border border-[#222] text-[#555] px-3 py-1 hover:border-[#FF003C] hover:text-[#FF003C] transition-colors"
                  >
                    setOwner(msg.sender)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
