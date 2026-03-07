const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, isAddress } = require("ethers");
require("dotenv").config();

const ROOT = path.join(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");

const NETWORK_CONFIG = {
  sepolia: {
    fileName: "deployments.sepolia.json",
    rpcEnv: "SEPOLIA_RPC_URL",
    chainId: 11155111,
  },
  celoSepolia: {
    fileName: "deployments.celoSepolia.json",
    rpcEnv: "CELO_SEPOLIA_RPC_URL",
    chainId: 11142220,
  },
  // Backward compatibility alias for old script names
  celoAlfajores: {
    fileName: "deployments.celoAlfajores.json",
    rpcEnv: "CELO_ALFAJORES_RPC_URL",
    chainId: 11142220,
  },
};

function parseArgs() {
  const idx = process.argv.indexOf("--network");
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(
      "Usage: node scripts/web3/validate.js --network <sepolia|celoSepolia|celoAlfajores>",
    );
  }

  const network = process.argv[idx + 1];
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return { network, config };
}

function readDeployment(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function validateContractCode(provider, label, address) {
  if (!isAddress(address)) {
    throw new Error(`Invalid address for ${label}: ${address}`);
  }

  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`No contract bytecode at ${label}: ${address}`);
  }
}

async function main() {
  const { network, config } = parseArgs();
  const primaryPath = path.join(DATA_DIR, config.fileName);
  const legacyPath = path.join(DATA_DIR, "deployments.celoAlfajores.json");
  const isCeloNetwork =
    network === "celoSepolia" || network === "celoAlfajores";
  const deploymentPath = fs.existsSync(primaryPath)
    ? primaryPath
    : isCeloNetwork
    ? legacyPath
    : primaryPath;
  const deployment = readDeployment(deploymentPath);

  if (Number(deployment.chainId) !== config.chainId) {
    throw new Error(
      `Chain mismatch in ${deploymentPath}. Expected ${config.chainId}, got ${deployment.chainId}`,
    );
  }

  const rpcUrl =
    process.env[config.rpcEnv] ||
    process.env.CELO_SEPOLIA_RPC_URL ||
    process.env.CELO_ALFAJORES_RPC_URL;
  if (!rpcUrl) {
    throw new Error(`Missing required RPC env var: ${config.rpcEnv}`);
  }

  const provider = new JsonRpcProvider(rpcUrl);

  const contracts = deployment.contracts || {};
  const requiredContracts = [
    ["EvidenceAttestation", contracts.EvidenceAttestation],
    ["ReportAccessNFT", contracts.ReportAccessNFT],
    ["EnterpriseLicenseNFT", contracts.EnterpriseLicenseNFT],
    ["BountyEscrow", contracts.BountyEscrow],
    ["StableToken", contracts.StableToken],
  ];

  for (const [label, address] of requiredContracts) {
    await validateContractCode(provider, label, address);
    console.log(`Validated ${label}: ${address}`);
  }

  console.log(`Deployment validation passed for ${network}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
