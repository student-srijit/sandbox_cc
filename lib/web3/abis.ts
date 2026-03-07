export const REPORT_ACCESS_NFT_ABI = [
  "function pricing(bytes32 reportId) view returns (uint256 nativePrice, uint256 stablePrice, bool enabled)",
  "function buyWithNative(bytes32 reportId, address to) payable returns (uint256 tokenId)",
  "function buyWithStable(bytes32 reportId, address to) returns (uint256 tokenId)",
] as const;

export const ENTERPRISE_LICENSE_NFT_ABI = [
  "function plans(bytes32 planId) view returns (uint256 nativePrice, uint256 stablePrice, uint64 durationSeconds, bool enabled)",
  "function buyWithNative(bytes32 planId, address to, uint32 seats) payable returns (uint256 tokenId)",
  "function buyWithStable(bytes32 planId, address to, uint32 seats) returns (uint256 tokenId)",
] as const;

export const BOUNTY_ESCROW_ABI = [
  "function createNativeBounty(uint64 deadline) payable returns (uint256 bountyId)",
  "function createTokenBounty(address token, uint256 amount, uint64 deadline) returns (uint256 bountyId)",
] as const;

export const EVIDENCE_ATTESTATION_ABI = [
  "function nonces(address submitter) view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function attestEvidence(string threatId, string cid, bytes32 contentHash, uint256 deadline, bytes reviewerSignature) returns (bytes32 evidenceId)",
  "event EvidenceAttested(bytes32 indexed evidenceId, address indexed submitter, bytes32 indexed threatIdHash, string cid, bytes32 contentHash, address reviewer)",
] as const;

export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
] as const;
