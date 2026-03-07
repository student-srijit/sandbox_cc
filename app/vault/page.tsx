"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const ZERO_PRICE: PriceState = {
  reportNative: "0.0000",
  reportStable: "0.00",
  reportEnabled: false,
  planNative: "0.0000",
  planStable: "0.00",
  planEnabled: false,
  stableSymbol: "USDC",
};

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
  const [paymentMode, setPaymentMode] = useState<"native" | "stable">("native");
  const [isBusy, setIsBusy] = useState(false);
  const [txState, setTxState] = useState<TxState>(null);
  const [prices, setPrices] = useState<PriceState>(ZERO_PRICE);
  const [notification, setNotification] = useState<string | null>(null);

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

      if (paymentMode === "native") {
        const value = ethers.parseEther(bountyAmount);
        const tx = await escrow.createNativeBounty(deadline, { value });
        await awaitTx("Bounty creation", chain, tx);
      } else {
        const decimals = Number(await stable.decimals());
        const tokenAmount = ethers.parseUnits(bountyAmount, decimals);
        const creator = await signer.getAddress();
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
        await awaitTx("Bounty creation", chain, tx);
      }
    } catch (error) {
      showNotification(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const explorerBase = SUPPORTED_CHAINS[activeChain].blockExplorerUrls[0];

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

        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar flex items-center justify-center">
          {/* In-page notification toast */}
          {notification && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#0b0c10] border border-[#FF003C] text-[#FF003C] text-xs tracking-widest px-6 py-3 font-mono shadow-[0_0_20px_rgba(255,0,60,0.3)] animate-pulse">
              ⚠ {notification}
            </div>
          )}

          {/* The Honey-Vault UI */}
          <div className="max-w-4xl w-full space-y-6">
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
                  <button
                    onClick={handleCreateBounty}
                    disabled={isBusy}
                    className="w-full py-2 border border-[var(--accent-magenta)] text-[var(--accent-magenta)] hover:bg-[var(--accent-magenta)] hover:text-black text-xs tracking-widest"
                  >
                    {isBusy ? "PROCESSING..." : "CREATE BOUNTY"}
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
