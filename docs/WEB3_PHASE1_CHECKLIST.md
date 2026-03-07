# Web3 Phase 1 Checklist (Deployment-Ready)

## Scope Implemented

- Dual-chain wallet control in app (`Celo Alfajores` + `Sepolia`).
- Solidity contracts for:
  - evidence attestation
  - report access NFT
  - enterprise license NFT
  - bounty escrow
- Hardhat build/deploy toolchain with chain network config.
- Vault page switched from simulated actions to real contract transactions.

## Pre-Deployment Setup

1. Copy `.env.web3.example` to `.env.web3`.
2. Set:
   - `DEPLOYER_PRIVATE_KEY`
   - `ADMIN_ADDRESS`
   - `TREASURY_ADDRESS`
   - `STABLE_TOKEN_ADDRESS`
   - RPC URLs for Sepolia and Alfajores
3. Compile contracts:
   - `npm run web3:compile`
4. Deploy contracts:
   - `npm run web3:deploy:alfajores`
   - `npm run web3:deploy:sepolia`

## Frontend Address Binding

After deployment, set `NEXT_PUBLIC_*` values in `.env` (or `.env.local`):

- Sepolia:
  - `NEXT_PUBLIC_SEPOLIA_EVIDENCE_ATTESTATION`
  - `NEXT_PUBLIC_SEPOLIA_REPORT_ACCESS_NFT`
  - `NEXT_PUBLIC_SEPOLIA_ENTERPRISE_LICENSE_NFT`
  - `NEXT_PUBLIC_SEPOLIA_BOUNTY_ESCROW`
  - `NEXT_PUBLIC_SEPOLIA_STABLE_TOKEN`

- Celo Alfajores:
  - `NEXT_PUBLIC_CELO_EVIDENCE_ATTESTATION`
  - `NEXT_PUBLIC_CELO_REPORT_ACCESS_NFT`
  - `NEXT_PUBLIC_CELO_ENTERPRISE_LICENSE_NFT`
  - `NEXT_PUBLIC_CELO_BOUNTY_ESCROW`
  - `NEXT_PUBLIC_CELO_STABLE_TOKEN`

## Functional Verification Steps

1. Connect wallet in `/vault`.
2. Switch preferred chain and run wallet switch.
3. Validate report plan lookup shows expected price and status.
4. Execute report purchase with native token.
5. Execute report purchase with stable token (approval + buy).
6. Execute enterprise license purchase (native and stable).
7. Create bounty with native token.
8. Create bounty with stable token (approval + create).
9. Confirm tx hashes resolve on explorer.

## Known External Blockers

- `next build` can fail in restricted network environments due to external font fetch (`fonts.gstatic.com`) errors.
- `next build` can fail with `.next/trace` `EPERM` when file lock/permission issues exist on Windows.

## Next Phase

- Replace current local ledger hashes with on-chain event indexing.
- Add Pinata upload + CID verification + evidence attestation flow.
- Add backend endpoints to tie threat records to on-chain evidence IDs.
