export type SupportedChain = 11155111 | 11142220;

export type ContractSet = {
  evidenceAttestation: string;
  reportAccessNFT: string;
  enterpriseLicenseNFT: string;
  bountyEscrow: string;
  stableToken: string;
};

// Deployed addresses from scripts/web3/ — kept here as fallback when env vars aren't set.
export const CONTRACTS_BY_CHAIN: Record<SupportedChain, ContractSet> = {
  // Sepolia — deployed 2026-03-07
  11155111: {
    evidenceAttestation: "0xcD9733D4eC3B007187E27DdB37F0B533165afa9a",
    reportAccessNFT:     "0xfEc8072a21489EE832B87b5dfDD60f9fF413Be75",
    enterpriseLicenseNFT:"0x0ffFb771Ec41Ac7cE7A17f0c263e4B875fcB73eB",
    bountyEscrow:        "0x56280229FEbEfD81F91D9CaEEaafed8dfcf4B64e",
    stableToken:         "0xcD9733D4eC3B007187E27DdB37F0B533165afa9a",
  },
  // Celo Sepolia — deployed 2026-03-07
  11142220: {
    evidenceAttestation: "0xfEc8072a21489EE832B87b5dfDD60f9fF413Be75",
    reportAccessNFT:     "0x0ffFb771Ec41Ac7cE7A17f0c263e4B875fcB73eB",
    enterpriseLicenseNFT:"0x56280229FEbEfD81F91D9CaEEaafed8dfcf4B64e",
    bountyEscrow:        "0xE1D41D8cff64AD6F75D4Dedd15aFbe0dD5f73039",
    stableToken:         "0xcD9733D4eC3B007187E27DdB37F0B533165afa9a",
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
      evidenceAttestation:
        process.env.NEXT_PUBLIC_SEPOLIA_EVIDENCE_ATTESTATION ?? "",
      reportAccessNFT: process.env.NEXT_PUBLIC_SEPOLIA_REPORT_ACCESS_NFT ?? "",
      enterpriseLicenseNFT:
        process.env.NEXT_PUBLIC_SEPOLIA_ENTERPRISE_LICENSE_NFT ?? "",
      bountyEscrow: process.env.NEXT_PUBLIC_SEPOLIA_BOUNTY_ESCROW ?? "",
      stableToken: process.env.NEXT_PUBLIC_SEPOLIA_STABLE_TOKEN ?? "",
    };
  }

  return {
    evidenceAttestation:
      process.env.NEXT_PUBLIC_CELO_EVIDENCE_ATTESTATION ?? "",
    reportAccessNFT: process.env.NEXT_PUBLIC_CELO_REPORT_ACCESS_NFT ?? "",
    enterpriseLicenseNFT:
      process.env.NEXT_PUBLIC_CELO_ENTERPRISE_LICENSE_NFT ?? "",
    bountyEscrow: process.env.NEXT_PUBLIC_CELO_BOUNTY_ESCROW ?? "",
    stableToken: process.env.NEXT_PUBLIC_CELO_STABLE_TOKEN ?? "",
  };
}

export function getContractsForChain(chain: SupportedChain): ContractSet {
  const configured = CONTRACTS_BY_CHAIN[chain];
  const env = envContracts(chain);

  return {
    evidenceAttestation:
      env.evidenceAttestation || configured.evidenceAttestation,
    reportAccessNFT: env.reportAccessNFT || configured.reportAccessNFT,
    enterpriseLicenseNFT:
      env.enterpriseLicenseNFT || configured.enterpriseLicenseNFT,
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
