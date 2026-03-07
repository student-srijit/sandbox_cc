const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log(
    `Deploying with: ${deployer.address} on chain ${chainId} (${network.name})`,
  );

  const stableToken = requiredEnv("STABLE_TOKEN_ADDRESS");
  const treasury = requiredEnv("TREASURY_ADDRESS");
  const admin = requiredEnv("ADMIN_ADDRESS");

  console.log("Deploying EvidenceAttestation...");
  const EvidenceAttestation = await ethers.getContractFactory(
    "EvidenceAttestation",
  );
  const evidenceAttestation = await EvidenceAttestation.deploy(admin);
  await evidenceAttestation.waitForDeployment();
  const evidenceAttestationAddr = await evidenceAttestation.getAddress();
  console.log(`  EvidenceAttestation: ${evidenceAttestationAddr}`);

  console.log("Deploying ReportAccessNFT...");
  const ReportAccessNFT = await ethers.getContractFactory("ReportAccessNFT");
  const reportAccess = await ReportAccessNFT.deploy(
    admin,
    stableToken,
    treasury,
  );
  await reportAccess.waitForDeployment();
  const reportAccessAddr = await reportAccess.getAddress();
  console.log(`  ReportAccessNFT: ${reportAccessAddr}`);

  console.log("Deploying EnterpriseLicenseNFT...");
  const EnterpriseLicenseNFT = await ethers.getContractFactory(
    "EnterpriseLicenseNFT",
  );
  const enterpriseLicense = await EnterpriseLicenseNFT.deploy(
    admin,
    stableToken,
    treasury,
  );
  await enterpriseLicense.waitForDeployment();
  const enterpriseLicenseAddr = await enterpriseLicense.getAddress();
  console.log(`  EnterpriseLicenseNFT: ${enterpriseLicenseAddr}`);

  console.log("Deploying BountyEscrow...");
  const BountyEscrow = await ethers.getContractFactory("BountyEscrow");
  const bountyEscrow = await BountyEscrow.deploy(admin);
  await bountyEscrow.waitForDeployment();
  const bountyEscrowAddr = await bountyEscrow.getAddress();
  console.log(`  BountyEscrow: ${bountyEscrowAddr}`);

  // Save to deployments JSON
  const deploymentsDir = path.join(__dirname, "../../data");
  if (!fs.existsSync(deploymentsDir))
    fs.mkdirSync(deploymentsDir, { recursive: true });
  const deploymentsFile = path.join(
    deploymentsDir,
    `deployments.${network.name}.json`,
  );
  const deploymentData = {
    network: network.name,
    chainId: Number(chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      EvidenceAttestation: evidenceAttestationAddr,
      ReportAccessNFT: reportAccessAddr,
      EnterpriseLicenseNFT: enterpriseLicenseAddr,
      BountyEscrow: bountyEscrowAddr,
      StableToken: stableToken,
    },
  };
  fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentData, null, 2));
  console.log(`\nDeployment data saved to: ${deploymentsFile}`);

  console.log("\nRun `npm run web3:sync-env` to update NEXT_PUBLIC_* contract addresses.");

  console.log("\n=== Deployment Summary ===");
  console.log(`EvidenceAttestation=${evidenceAttestationAddr}`);
  console.log(`ReportAccessNFT=${reportAccessAddr}`);
  console.log(`EnterpriseLicenseNFT=${enterpriseLicenseAddr}`);
  console.log(`BountyEscrow=${bountyEscrowAddr}`);
  console.log(`StableToken=${stableToken}`);

  // Print verify commands
  console.log("\n=== Verify Commands ===");
  console.log(
    `npx hardhat verify --network ${network.name} ${evidenceAttestationAddr} "${admin}"`,
  );
  console.log(
    `npx hardhat verify --network ${network.name} ${reportAccessAddr} "${admin}" "${stableToken}" "${treasury}"`,
  );
  console.log(
    `npx hardhat verify --network ${network.name} ${enterpriseLicenseAddr} "${admin}" "${stableToken}" "${treasury}"`,
  );
  console.log(
    `npx hardhat verify --network ${network.name} ${bountyEscrowAddr} "${admin}"`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
