export type SupportedChainId = 11155111 | 11142220;

export type ChainConfig = {
  chainId: SupportedChainId;
  chainHex: `0x${string}`;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export const SEPOLIA_CHAIN: ChainConfig = {
  chainId: 11155111,
  chainHex: "0xaa36a7",
  chainName: "Sepolia",
  nativeCurrency: {
    name: "Sepolia Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.sepolia.org"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

export const CELO_SEPOLIA_CHAIN: ChainConfig = {
  chainId: 11142220,
  chainHex: "0xaa044c",
  chainName: "Celo Sepolia",
  nativeCurrency: {
    name: "Celo",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: ["https://forno.celo-sepolia.celo-testnet.org"],
  blockExplorerUrls: ["https://celo-sepolia.blockscout.com"],
};

// Backward-compatible alias to avoid breaking older imports/usages.
export const CELO_ALFAJORES_CHAIN = CELO_SEPOLIA_CHAIN;

export const SUPPORTED_CHAINS: Record<SupportedChainId, ChainConfig> = {
  11155111: SEPOLIA_CHAIN,
  11142220: CELO_SEPOLIA_CHAIN,
};

export const DEFAULT_CHAIN_ID: SupportedChainId = 11155111;
