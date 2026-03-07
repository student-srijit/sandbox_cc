// scripts/simulate-attack.js
import fs from "fs";

const API_BASE = "http://localhost:8000";

// Default baseline signals representing a perfect human with no flags
const HUMAN_SIGNALS = {
  mouseEventsCount: 250,
  mousePathLinearity: 0.85,
  mouseSpeedVariance: 24, // High variance
  webdriver: false,
  hasChromeGlobal: true,
  isChromeUa: true,
  pluginsCount: 5,
  languagesCount: 3,
  screenWidth: 1920,
  screenHeight: 1080,
  canvasHash: "real_gpu_hash_2f8ea1",
  timeToFirstInteraction: 800, // Realistic delay
};

async function runAttackSequence() {
  console.log("════════════════════════════════════════════════════════════");
  console.log(" BHOOL BHULAIYAA — BEHAVIORAL THREAT INTELLIGENCE SIMULATOR ");
  console.log(
    "════════════════════════════════════════════════════════════\\n",
  );

  await attack(
    "1. SCRIPT KIDDIE (cURL)",
    "Basic command-line tool probing sensitive environment variables.",
    "/.env",
    {
      "User-Agent": "curl/7.64.1",
      Accept: "*/* ",
    },
    {
      ...HUMAN_SIGNALS,
      mouseEventsCount: 0, // No mouse in cURL
      isChromeUa: false,
      canvasHash: "blank", // Can't render canvas
      pluginsCount: 0,
      languagesCount: 0,
      screenWidth: 0,
    },
  );

  await delay(1500);

  await attack(
    "2. MEV BOT (Fast Polling)",
    "Automated node hitting the RPC endpoints via Python Requests rapidly.",
    "/api/1",
    {
      "User-Agent": "python-requests/2.26.0",
      Accept: "application/json",
    },
    {
      ...HUMAN_SIGNALS,
      mouseEventsCount: 0,
      isChromeUa: false,
      canvasHash: "blank",
    },
  );

  await delay(1500);

  await attack(
    "3. WALLET DRAINER (Playwright DOM Scraper)",
    "Headless Chromium instance looking to scrape DOM selectors rapidly.",
    "/",
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/92.0.4515.159 Safari/537.36",
      "Accept-Language": "en-US",
      "Sec-Fetch-Site": "same-origin",
    },
    {
      ...HUMAN_SIGNALS,
      mouseEventsCount: 5, // Faked a few clicks
      mousePathLinearity: 0.99, // Perfectly straight simulated lines
      mouseSpeedVariance: 2, // Machine consistency
      webdriver: true, // Forgot to hide puppeteer flag
      canvasHash: "a4b8f52a", // Generic headless fallback hash
    },
  );

  await delay(1500);

  await attack(
    "4. SOPHISTICATED ATTACKER (Stealth Scraper)",
    "Near pixel-perfect spoofing of browser headers, but misses deep implicit canvas/timing cues.",
    "/",
    {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Site": "same-origin",
      Connection: "keep-alive",
    },
    {
      ...HUMAN_SIGNALS,
      mouseEventsCount: 15,
      hasChromeGlobal: false, // Forged UA, but failed to synthesize window.chrome
      timeToFirstInteraction: -1, // Fast execution bypassing human delays
    },
  );
}

// -------------------------------------------------------------

let cachedSourceIp = null;

async function resolveSourceIp() {
  if (cachedSourceIp) return cachedSourceIp;
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    if (!res.ok) return null;
    const data = await res.json();
    cachedSourceIp = data?.ip || null;
    return cachedSourceIp;
  } catch {
    return null;
  }
}

async function attack(name, description, path, headers, clientSignals) {
  console.log(`[+] INITIATING: ${name}`);
  console.log(`    Type: ${description}`);

  try {
    // We'll bypass Next.js entirely for this manual geo test and jump straight to the Web3 RPC injection step
    const mockResult = { score: 99, tier: "BOT" };

    if (mockResult.tier === "BOT" || mockResult.tier === "SUSPICIOUS") {
      const sourceIp = await resolveSourceIp();

      // 4. Inject a fake Web3 RPC call to trigger the polymorphic honeypot backend
      console.log(
        `    [*] INJECTING      >> Sending fake eth_sendTransaction payload to backend...`,
      );
      await fetch(`http://localhost:8000/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BB-Threat-Score": mockResult.score.toString(),
          "X-BB-Tier": mockResult.tier,
          "X-BB-Session": "simulated-session-" + Date.now().toString(),
          ...(sourceIp ? { "X-Forwarded-For": sourceIp } : {}),
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_sendTransaction",
          params: [
            {
              from: "0xAttacker...",
              to: "0xBaitWallet001...",
              value: "0xDE0B6B3A7640000", // 1 ETH
            },
          ],
          id: 1,
        }),
      });
      console.log(`    [✓] INJECTED       >> Backend ingested payload.\n`);

      // Force flush for instant UI
      setTimeout(() => {
        fetch("http://localhost:8000/api/flush", { method: "POST" }).catch(
          () => {},
        );
      }, 500);
    } else if (result.tier === "SUSPICIOUS") {
      console.log(`    [?] DETERMINATION  >> SUSPICIOUS PROXY.`);
      console.log(
        `    [⧗] ACTION         >> Issuing silent Proof-of-Work challenge, draining CPU cycles.\n`,
      );
    } else {
      console.log(`    [☺] DETERMINATION  >> HUMAN.`);
      console.log(`    [✓] ACTION         >> Connection permitted.\n`);
    }
  } catch (err) {
    console.error(
      `    [-] Error: Is the Next.js dev server running on localhost:3000?`,
      err.message,
      "\\n",
    );
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

runAttackSequence().catch(console.error);
