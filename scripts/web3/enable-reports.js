/**
 * enable-reports.js
 * Calls setReportPricing() on the deployed ReportAccessNFT contract
 * for every report in the marketplace catalogue, enabling on-chain purchases.
 *
 * Usage:
 *   npx hardhat run scripts/web3/enable-reports.js --network sepolia
 */

const { ethers, network } = require("hardhat");

// Must match the reportId values in app/marketplace/page.tsx CATALOG
// keccak256-style bytes32 identifiers used by the frontend
const REPORTS = [
  { id: "r1", reportId: "0x" + "a1".repeat(32).slice(0, 64), priceEth: "0.012" },
  { id: "r2", reportId: "0x" + "b2".repeat(32).slice(0, 64), priceEth: "0.008" },
  { id: "r3", reportId: "0x" + "c3".repeat(32).slice(0, 64), priceEth: "0.025" },
  { id: "r4", reportId: "0x" + "d4".repeat(32).slice(0, 64), priceEth: "0.006" },
  { id: "r5", reportId: "0x" + "e5".repeat(32).slice(0, 64), priceEth: "0.015" },
  { id: "r6", reportId: "0x" + "f6".repeat(32).slice(0, 64), priceEth: "0.010" },
];

// Deployed ReportAccessNFT on Sepolia (from lib/contracts.ts)
const REPORT_ACCESS_NFT = "0xfEc8072a21489EE832B87b5dfDD60f9fF413Be75";

const ABI = [
  "function setReportPricing(bytes32 reportId, uint256 nativePrice, uint256 stablePrice, bool enabled) external",
  "function pricing(bytes32) external view returns (uint256 nativePrice, uint256 stablePrice, bool enabled)",
];

async function main() {
  const [admin] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log(`Admin: ${admin.address} | Chain: ${chainId} (${network.name})`);

  const contract = new ethers.Contract(REPORT_ACCESS_NFT, ABI, admin);

  for (const r of REPORTS) {
    const nativePrice = ethers.parseEther(r.priceEth);
    const stablePrice = ethers.parseUnits(r.priceEth, 6); // USDC-style 6 decimals

    // Check current state
    const current = await contract.pricing(r.reportId);
    if (current.enabled && current.nativePrice === nativePrice) {
      console.log(`  [${r.id}] Already enabled at ${r.priceEth} ETH — skipping`);
      continue;
    }

    console.log(`  [${r.id}] Enabling at ${r.priceEth} ETH (reportId: ${r.reportId.slice(0, 10)}...)`);
    const tx = await contract.setReportPricing(r.reportId, nativePrice, stablePrice, true);
    console.log(`         TX: ${tx.hash}`);
    await tx.wait();
    console.log(`         ✓ Confirmed`);
  }

  console.log("\nAll reports enabled. Buyers can now call buyWithNative() on Sepolia.");
}

main().catch((e) => { console.error(e); process.exit(1); });
