# Contracts

Initial Web3 core for dual-chain deployment:

- `EvidenceAttestation.sol`
- `ReportAccessNFT.sol`
- `EnterpriseLicenseNFT.sol`
- `BountyEscrow.sol`

## Compile

```bash
npm run web3:compile
```

## Deploy

1. Copy `.env.web3.example` to `.env.web3` and fill values.
2. Run one of:

```bash
npm run web3:deploy:sepolia
npm run web3:deploy:alfajores
```

## Notes

- Current deployment script expects one stable token address for target chain.
- Pinata/IPFS upload + backend attestation wiring comes in next implementation phase.
