export type SupportedChain = 11155111 | 11142220;

export type ContractSet = {
  evidenceAttestation: string;
  reportAccessNFT: string;
  enterpriseLicenseNFT: string;
  bountyEscrow: string;
  stableToken: string;
};

// Fill with deployed addresses after running web3 deployment scripts.
export const CONTRACTS_BY_CHAIN: Record<SupportedChain, ContractSet> = {
  11155111: {
    evidenceAttestation: "",
    reportAccessNFT: "",
    enterpriseLicenseNFT: "",
    bountyEscrow: "",
    stableToken: "",
  },
  11142220: {
    evidenceAttestation: "",
    reportAccessNFT: "",
    enterpriseLicenseNFT: "",
    bountyEscrow: "",
    stableToken: "",
  },
};

export const CHAIN_LABEL: Record<SupportedChain, string> = {
  11155111: "Sepolia",
  11142220: "Celo Sepolia",
};

type EnvContractSet = Partial<ContractSet>;

function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function envContracts(chain: SupportedChain): EnvContractSet {
  if (chain === 11155111) {
    return {
      evidenceAttestation: process.env.NEXT_PUBLIC_SEPOLIA_EVIDENCE_ATTESTATION ?? "",
      reportAccessNFT: process.env.NEXT_PUBLIC_SEPOLIA_REPORT_ACCESS_NFT ?? "",
      enterpriseLicenseNFT: process.env.NEXT_PUBLIC_SEPOLIA_ENTERPRISE_LICENSE_NFT ?? "",
      bountyEscrow: process.env.NEXT_PUBLIC_SEPOLIA_BOUNTY_ESCROW ?? "",
      stableToken: process.env.NEXT_PUBLIC_SEPOLIA_STABLE_TOKEN ?? "",
    };
  }

  return {
    evidenceAttestation: process.env.NEXT_PUBLIC_CELO_EVIDENCE_ATTESTATION ?? "",
    reportAccessNFT: process.env.NEXT_PUBLIC_CELO_REPORT_ACCESS_NFT ?? "",
    enterpriseLicenseNFT: process.env.NEXT_PUBLIC_CELO_ENTERPRISE_LICENSE_NFT ?? "",
    bountyEscrow: process.env.NEXT_PUBLIC_CELO_BOUNTY_ESCROW ?? "",
    stableToken: process.env.NEXT_PUBLIC_CELO_STABLE_TOKEN ?? "",
  };
}

export function getContractsForChain(chain: SupportedChain): ContractSet {
  const configured = CONTRACTS_BY_CHAIN[chain];
  const env = envContracts(chain);

  return {
    evidenceAttestation: env.evidenceAttestation || configured.evidenceAttestation,
    reportAccessNFT: env.reportAccessNFT || configured.reportAccessNFT,
    enterpriseLicenseNFT: env.enterpriseLicenseNFT || configured.enterpriseLicenseNFT,
    bountyEscrow: env.bountyEscrow || configured.bountyEscrow,
    stableToken: env.stableToken || configured.stableToken,
  };
}

export function isContractsConfigured(contracts: ContractSet): boolean {
  return [
    contracts.evidenceAttestation,
    contracts.reportAccessNFT,
    contracts.enterpriseLicenseNFT,
    contracts.bountyEscrow,
    contracts.stableToken,
  ].every((address) => isAddressLike(address));
}
