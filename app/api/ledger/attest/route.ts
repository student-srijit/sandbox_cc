import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";
import { getContractsForChain, type SupportedChain } from "@/lib/contracts";
import { EVIDENCE_ATTESTATION_ABI } from "@/lib/web3/abis";

type AttestBody = {
  chainId: number;
  threatId: string;
  contentHash: string;
  submitter: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AttestBody>;
    const chain = toSupportedChain(Number(body.chainId));
    const threatId = (body.threatId || "").trim();
    const contentHash = (body.contentHash || "").trim();
    const submitter = (body.submitter || "").trim();

    if (!chain) {
      return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    if (!threatId) {
      return NextResponse.json({ error: "threatId is required" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(contentHash)) {
      return NextResponse.json(
        { error: "contentHash must be bytes32 hex" },
        { status: 400 },
      );
    }

    if (!ethers.isAddress(submitter)) {
      return NextResponse.json(
        { error: "submitter must be a valid address" },
        { status: 400 },
      );
    }

    const contracts = getContractsForChain(chain);
    if (!ethers.isAddress(contracts.evidenceAttestation)) {
      return NextResponse.json(
        { error: "EvidenceAttestation contract is not configured" },
        { status: 400 },
      );
    }

    const provider = await getProvider(chain);
    const contract = new Contract(
      contracts.evidenceAttestation,
      EVIDENCE_ATTESTATION_ABI,
      provider,
    );
    const reviewerRole = ethers.id("REVIEWER_ROLE");

    const nonce = (await contract.nonces(submitter)) as bigint;
    const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
    const cid = `bb://threat/${threatId}`;

    const domain = {
      name: "EvidenceAttestation",
      version: "1",
      chainId: chain,
      verifyingContract: contracts.evidenceAttestation,
    };

    const types = {
      EvidenceRequest: [
        { name: "submitter", type: "address" },
        { name: "threatIdHash", type: "bytes32" },
        { name: "cidHash", type: "bytes32" },
        { name: "contentHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      submitter,
      threatIdHash: ethers.keccak256(ethers.toUtf8Bytes(threatId)),
      cidHash: ethers.keccak256(ethers.toUtf8Bytes(cid)),
      contentHash,
      nonce: nonce.toString(),
      deadline,
    };

    const responseBase = {
      chainId: chain,
      evidenceAttestation: contracts.evidenceAttestation,
      threatId,
      contentHash,
      cid,
      nonce: nonce.toString(),
      deadline,
      domain,
      types,
      value,
    };

    const reviewerPrivateKey =
      process.env.REVIEWER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

    if (/^0x[a-fA-F0-9]{64}$/.test(reviewerPrivateKey)) {
      const reviewerWallet = new Wallet(reviewerPrivateKey);
      const hasReviewerRole = await contract.hasRole(
        reviewerRole,
        reviewerWallet.address,
      );

      if (!hasReviewerRole) {
        return NextResponse.json(
          {
            error:
              "Configured reviewer wallet is missing REVIEWER_ROLE on EvidenceAttestation",
            reviewer: reviewerWallet.address,
          },
          { status: 500 },
        );
      }

      const reviewerSignature = await reviewerWallet.signTypedData(
        domain,
        types,
        value,
      );

      return NextResponse.json({
        ...responseBase,
        signingMode: "server-reviewer",
        reviewer: reviewerWallet.address,
        reviewerSignature,
      });
    }

    // Fallback mode: connected wallet signs as reviewer client-side.
    const submitterHasReviewerRole = await contract.hasRole(reviewerRole, submitter);
    if (!submitterHasReviewerRole) {
      return NextResponse.json(
        {
          error:
            "No server reviewer key configured, and connected wallet does not have REVIEWER_ROLE",
          reviewerRequired: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...responseBase,
      signingMode: "client-reviewer",
      reviewer: submitter,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
