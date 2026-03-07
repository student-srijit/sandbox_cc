const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function upsertEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return `${contents.trimEnd()}\n${line}\n`;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(
    `Deploying TestStable with ${deployer.address} on chain ${chainId} (${network.name})`,
  );

  const name = process.env.TEST_STABLE_NAME || "Test Stable";
  const symbol = process.env.TEST_STABLE_SYMBOL || "tSTABLE";
  const supply = process.env.TEST_STABLE_INITIAL_SUPPLY || "1000000";
  const initialSupply = ethers.parseUnits(supply, 18);

  const Factory = await ethers.getContractFactory("TestStable");
  const token = await Factory.deploy(name, symbol, initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log(`TestStable deployed at: ${tokenAddress}`);

  const dataDir = path.join(__dirname, "../../data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const infoFile = path.join(dataDir, `teststable.${network.name}.json`);
  fs.writeFileSync(
    infoFile,
    JSON.stringify(
      {
        network: network.name,
        chainId,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        token: {
          name,
          symbol,
          decimals: 18,
          initialSupply: supply,
          address: tokenAddress,
        },
      },
      null,
      2,
    ),
  );

  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let envText = fs.readFileSync(envPath, "utf8");
    envText = upsertEnv(envText, "STABLE_TOKEN_ADDRESS", tokenAddress);
    if (chainId === 11142220) {
      envText = upsertEnv(
        envText,
        "NEXT_PUBLIC_CELO_STABLE_TOKEN",
        tokenAddress,
      );
    }
    if (chainId === 11155111) {
      envText = upsertEnv(
        envText,
        "NEXT_PUBLIC_SEPOLIA_STABLE_TOKEN",
        tokenAddress,
      );
    }
    fs.writeFileSync(envPath, envText);
    console.log("Updated .env token addresses.");
  } else {
    console.log(".env not found. Skipped env update.");
  }

  console.log(`\nSet STABLE_TOKEN_ADDRESS=${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
