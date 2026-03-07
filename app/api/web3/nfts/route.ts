import { NextRequest, NextResponse } from "next/server";

type SupportedChain = "sepolia" | "celo-sepolia";

type UnifiedNft = {
  chain: SupportedChain;
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

type EtherscanNftTx = {
  contractAddress: string;
  tokenID: string;
  tokenName?: string;
  tokenSymbol?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  tokenURI?: string;
};

type EtherscanResponse = {
  status: string;
  message: string;
  result: EtherscanNftTx[] | string;
};

type BlockscoutCollection = {
  address?: string;
  address_hash?: string;
  name?: string;
  symbol?: string;
};

type BlockscoutNftItem = {
  id?: string | number;
  token_id?: string | number;
  tokenId?: string | number;
  token?: BlockscoutCollection;
  collection?: BlockscoutCollection;
  metadata?: {
    name?: string;
    image?: string;
    image_url?: string;
    attributes?: Array<{ trait_type?: string; value?: string | number }>;
  };
  image_url?: string;
  media?: {
    thumbnail_url?: string;
  };
  token_uri?: string;
  metadata_url?: string;
  owner?: {
    hash?: string;
  };
  timestamp?: string;
  tx_hash?: string;
  transaction_hash?: string;
};

type BlockscoutResponse = {
  items?: BlockscoutNftItem[];
};

const EXPLORER = {
  sepolia: {
    chainId: 11155111,
    v2Base: "https://api.etherscan.io/v2/api",
    explorerBase: "https://sepolia.etherscan.io",
    apiKeyEnv: "ETHERSCAN_API_KEY",
  },
  "celo-sepolia": {
    explorerBase: "https://celo-sepolia.blockscout.com",
  },
} as const;

function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function toIsoFromUnix(value: string | undefined): string {
  const seconds = Number(value || "0");
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date(0).toISOString();
  return new Date(seconds * 1000).toISOString();
}

function parseTraits(
  attrs: Array<{ trait_type?: string; value?: string | number }> | undefined,
): string[] {
  if (!Array.isArray(attrs)) return [];
  return attrs
    .slice(0, 8)
    .map((a) => {
      const key = asString(a?.trait_type, "trait");
      const value = asString(a?.value, "unknown");
      return `${key}: ${value}`;
    })
    .filter((x) => x.trim().length > 0);
}

async function fetchCeloSepoliaNfts(
  address: string,
  limit: number,
): Promise<UnifiedNft[]> {
  try {
    const res = await fetch(
      `${EXPLORER["celo-sepolia"].explorerBase}/api/v2/addresses/${address}/nft`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as BlockscoutResponse;
    const items = Array.isArray(data.items) ? data.items : [];

    return items.slice(0, limit).map((item) => {
      const tokenObj = item.token || item.collection || {};
      const contractAddress =
        asString(tokenObj.address) || asString(tokenObj.address_hash);
      const tokenId =
        asString(item.token_id) || asString(item.tokenId) || asString(item.id, "0");
      const symbol = asString(tokenObj.symbol, "NFT");
      const collection = asString(tokenObj.name, symbol);
      const name = asString(item.metadata?.name, `${symbol} #${tokenId}`);
      const imageUrl =
        asString(item.image_url) ||
        asString(item.metadata?.image_url) ||
        asString(item.metadata?.image) ||
        asString(item.media?.thumbnail_url);
      const txHash = asString(item.tx_hash) || asString(item.transaction_hash);

      return {
        chain: "celo-sepolia",
        contractAddress,
        tokenId,
        name,
        collection,
        symbol,
        imageUrl,
        metadataUrl: asString(item.token_uri) || asString(item.metadata_url),
        traits: parseTraits(item.metadata?.attributes),
        explorerUrl: txHash
          ? `${EXPLORER["celo-sepolia"].explorerBase}/tx/${txHash}`
          : `${EXPLORER["celo-sepolia"].explorerBase}/token/${contractAddress}?a=${tokenId}`,
        acquiredAt: item.timestamp || new Date(0).toISOString(),
        source: "blockscout",
      };
    });
  } catch {
    return [];
  }
}

async function fetchSepoliaNfts(
  address: string,
  limit: number,
): Promise<UnifiedNft[]> {
  try {
    const apiKey = process.env[EXPLORER.sepolia.apiKeyEnv] || "";

    const params = new URLSearchParams({
      chainid: String(EXPLORER.sepolia.chainId),
      module: "account",
      action: "tokennfttx",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(Math.max(limit * 4, 50)),
      sort: "desc",
    });

    if (apiKey) params.set("apikey", apiKey);

    const res = await fetch(`${EXPLORER.sepolia.v2Base}?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = (await res.json()) as EtherscanResponse;
    const txs = Array.isArray(data.result) ? data.result : [];
    const addr = normalizeAddress(address);

    // Derive current ownership from latest transfer per token.
    const ownership = new Map<string, EtherscanNftTx>();
    for (const tx of txs) {
      const key = `${normalizeAddress(tx.contractAddress)}:${tx.tokenID}`;
      if (ownership.has(key)) continue;
      if (normalizeAddress(asString(tx.to)) === addr) {
        ownership.set(key, tx);
      } else {
        ownership.set(key, tx);
      }
    }

    const owned = Array.from(ownership.values())
      .filter((tx) => normalizeAddress(asString(tx.to)) === addr)
      .slice(0, limit);

    return owned.map((tx) => {
      const symbol = asString(tx.tokenSymbol, "NFT");
      const tokenId = asString(tx.tokenID, "0");
      const contractAddress = asString(tx.contractAddress);
      return {
        chain: "sepolia",
        contractAddress,
        tokenId,
        name: `${asString(tx.tokenName, symbol)} #${tokenId}`,
        collection: asString(tx.tokenName, symbol),
        symbol,
        imageUrl: "",
        metadataUrl: asString(tx.tokenURI),
        traits: [],
        explorerUrl: `${EXPLORER.sepolia.explorerBase}/token/${contractAddress}?a=${tokenId}`,
        acquiredAt: toIsoFromUnix(tx.timeStamp),
        source: "etherscan",
      };
    });
  } catch {
    return [];
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const address = (req.nextUrl.searchParams.get("address") || "").trim();
    const chain = (req.nextUrl.searchParams.get("chain") ||
      "celo-sepolia") as SupportedChain;
    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit") || "24"), 1),
      60,
    );

    if (!isAddressLike(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    if (chain !== "sepolia" && chain !== "celo-sepolia") {
      return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    const nfts =
      chain === "celo-sepolia"
        ? await fetchCeloSepoliaNfts(address, limit)
        : await fetchSepoliaNfts(address, limit);

    return NextResponse.json({
      address,
      chain,
      total: nfts.length,
      nfts,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, nfts: [] }, { status: 500 });
  }
}
