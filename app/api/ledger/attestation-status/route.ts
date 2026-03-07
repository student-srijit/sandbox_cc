import { NextResponse } from "next/server";
import { JsonRpcProvider, ethers } from "ethers";
import { getContractsForChain, type SupportedChain } from "@/lib/contracts";

type StatusBody = {
  chainId: number;
  submitter: string;
  threatIds: string[];
};

function toSupportedChain(chainId: number): SupportedChain | null {
  if (chainId === 11155111 || chainId === 11142220) return chainId;
  return null;
}

function rpcUrlsForChain(chain: SupportedChain): string[] {
  if (chain === 11155111) {
    return [
      process.env.SEPOLIA_RPC_URL || "",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      "https://sepolia.gateway.tenderly.co",
    ].filter(Boolean);
  }

  return [
    process.env.CELO_SEPOLIA_RPC_URL ||
      process.env.CELO_ALFAJORES_RPC_URL ||
      "",
    "https://forno.celo-sepolia.celo-testnet.org",
  ].filter(Boolean);
}

async function getProvider(chain: SupportedChain): Promise<JsonRpcProvider> {
  const urls = rpcUrlsForChain(chain);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const provider = new JsonRpcProvider(url);
      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `No reachable RPC endpoint for chain ${chain}. Last error: ${String(lastError)}`,
  );
}

const EVIDENCE_ATTESTED_TOPIC = ethers.id(
  "EvidenceAttested(bytes32,address,bytes32,string,bytes32,address)",
);

const MAX_LOG_RANGE = 50_000;
const LOOKBACK_BLOCKS = 250_000;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<StatusBody>;
    const chain = toSupportedChain(Number(body.chainId));
    const submitter = (body.submitter || "").trim();
    const threatIds = Array.isArray(body.threatIds) ? body.threatIds : [];

    if (!chain) {
      return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    if (!ethers.isAddress(submitter)) {
      return NextResponse.json(
        { error: "submitter must be a valid address" },
        { status: 400 },
      );
    }

    const cleanThreatIds = threatIds
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0)
      .slice(0, 200);

    if (cleanThreatIds.length === 0) {
      return NextResponse.json({ verifiedThreatIds: [] });
    }

    const contracts = getContractsForChain(chain);
    if (!ethers.isAddress(contracts.evidenceAttestation)) {
      return NextResponse.json(
        { error: "EvidenceAttestation contract is not configured" },
        { status: 400 },
      );
    }

    const provider = await getProvider(chain);
    const latestBlock = await provider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - LOOKBACK_BLOCKS);

    const logs = [] as Awaited<ReturnType<typeof provider.getLogs>>;
    for (
      let fromBlock = startBlock;
      fromBlock <= latestBlock;
      fromBlock += MAX_LOG_RANGE + 1
    ) {
      const toBlock = Math.min(fromBlock + MAX_LOG_RANGE, latestBlock);
      const chunkLogs = await provider.getLogs({
        address: contracts.evidenceAttestation,
        fromBlock,
        toBlock,
        topics: [
          EVIDENCE_ATTESTED_TOPIC,
          null,
          ethers.zeroPadValue(submitter, 32),
        ],
      });
      logs.push(...chunkLogs);
    }

    const attestedThreatHashes = new Set<string>();
    for (const log of logs) {
      const threatHash = log.topics[3];
      if (typeof threatHash === "string") {
        attestedThreatHashes.add(threatHash.toLowerCase());
      }
    }

    const verifiedThreatIds = cleanThreatIds.filter((threatId) => {
      const threatHash = ethers
        .keccak256(ethers.toUtf8Bytes(threatId))
        .toLowerCase();
      return attestedThreatHashes.has(threatHash);
    });

    return NextResponse.json({ verifiedThreatIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
