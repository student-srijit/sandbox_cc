const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");
const ENV_PATH = path.join(ROOT, ".env");
const MANIFEST_PATH = path.join(DATA_DIR, "deployments.manifest.json");

const NETWORK_FILES = {
  sepolia: path.join(DATA_DIR, "deployments.sepolia.json"),
  celoSepolia: path.join(DATA_DIR, "deployments.celoSepolia.json"),
  celoAlfajoresLegacy: path.join(DATA_DIR, "deployments.celoAlfajores.json"),
};

const ENV_KEYS = {
  11155111: {
    evidenceAttestation: "NEXT_PUBLIC_SEPOLIA_EVIDENCE_ATTESTATION",
    reportAccessNFT: "NEXT_PUBLIC_SEPOLIA_REPORT_ACCESS_NFT",
    enterpriseLicenseNFT: "NEXT_PUBLIC_SEPOLIA_ENTERPRISE_LICENSE_NFT",
    bountyEscrow: "NEXT_PUBLIC_SEPOLIA_BOUNTY_ESCROW",
    stableToken: "NEXT_PUBLIC_SEPOLIA_STABLE_TOKEN",
  },
  11142220: {
    evidenceAttestation: "NEXT_PUBLIC_CELO_EVIDENCE_ATTESTATION",
    reportAccessNFT: "NEXT_PUBLIC_CELO_REPORT_ACCESS_NFT",
    enterpriseLicenseNFT: "NEXT_PUBLIC_CELO_ENTERPRISE_LICENSE_NFT",
    bountyEscrow: "NEXT_PUBLIC_CELO_BOUNTY_ESCROW",
    stableToken: "NEXT_PUBLIC_CELO_STABLE_TOKEN",
  },
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function upsertEnvKey(content, key, value) {
  const regex = new RegExp(`^(${key}=).*$`, "m");
  const safeValue = value ?? "";

  if (regex.test(content)) {
    return content.replace(regex, `$1${safeValue}`);
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return `${content}${suffix}${key}=${safeValue}\n`;
}

function toManifestEntry(deployment) {
  return {
    network: deployment.network,
    chainId: deployment.chainId,
    deployedAt: deployment.deployedAt,
    deployer: deployment.deployer,
    contracts: deployment.contracts,
  };
}

function main() {
  const deploymentsByChain = {};
  for (const [name, filePath] of Object.entries(NETWORK_FILES)) {
    const deployment = readJson(filePath);
    if (!deployment) continue;

    const chainKey = String(deployment.chainId);
    const isLegacy = name.toLowerCase().includes("legacy");

    // Prefer non-legacy files if both legacy and new exist for same chain.
    if (!deploymentsByChain[chainKey] || !isLegacy) {
      deploymentsByChain[chainKey] = deployment;
    }
  }

  const deployments = Object.values(deploymentsByChain);

  if (deployments.length === 0) {
    throw new Error("No deployment files found under data/deployments.*.json");
  }

  const manifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    deployments: {},
  };

  for (const deployment of deployments) {
    manifest.deployments[String(deployment.chainId)] =
      toManifestEntry(deployment);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  let envContent = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8")
    : "";

  for (const deployment of deployments) {
    const keys = ENV_KEYS[deployment.chainId];
    if (!keys) {
      continue;
    }

    envContent = upsertEnvKey(
      envContent,
      keys.evidenceAttestation,
      deployment.contracts.EvidenceAttestation,
    );
    envContent = upsertEnvKey(
      envContent,
      keys.reportAccessNFT,
      deployment.contracts.ReportAccessNFT,
    );
    envContent = upsertEnvKey(
      envContent,
      keys.enterpriseLicenseNFT,
      deployment.contracts.EnterpriseLicenseNFT,
    );
    envContent = upsertEnvKey(
      envContent,
      keys.bountyEscrow,
      deployment.contracts.BountyEscrow,
    );
    envContent = upsertEnvKey(
      envContent,
      keys.stableToken,
      deployment.contracts.StableToken,
    );
  }

  fs.writeFileSync(ENV_PATH, envContent, "utf8");

  console.log(`Synced deployment addresses into ${ENV_PATH}`);
  console.log(`Wrote manifest: ${MANIFEST_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
