// scripts/simulate-attack.ts
import fs from "fs";

const API_BASE = "http://localhost:3000";

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
  console.log("════════════════════════════════════════════════════════════\n");

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

let cachedSourceIp: string | null = null;

async function resolveSourceIp(): Promise<string | null> {
  if (cachedSourceIp) return cachedSourceIp;
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    cachedSourceIp = data.ip || null;
    return cachedSourceIp;
  } catch {
    return null;
  }
}

async function attack(
  name: string,
  description: string,
  path: string,
  headers: Record<string, string>,
  clientSignals: any,
) {
  console.log(`[+] INITIATING: ${name}`);
  console.log(`    Type: ${description}`);

  const sourceIp = await resolveSourceIp();
  const headersWithIp = sourceIp
    ? { ...headers, "X-Forwarded-For": sourceIp }
    : headers;

  try {
    // 1. Hit standard endpoint to trigger HTTP Edge Middleware (Server-Side analysis)
    const res1 = await fetch(`${API_BASE}${path}`, { headers: headersWithIp });

    // Extract HTTP-only cookies injected by middleware
    const setCookieStr = res1.headers.get("set-cookie") || "";

    // Crude parsing of Next.js multiline set-cookie string
    const cookies = setCookieStr
      .split(",")
      .map((c) => c.trim().split(";")[0])
      .filter(
        (c) =>
          c.startsWith("bb-server-score") || c.startsWith("bb-poly-ticket"),
      )
      .join("; ");

    // 2. Transmit the Client-Side Telemetry Payload
    const res2 = await fetch(`${API_BASE}/api/telemetry`, {
      method: "POST",
      headers: {
        ...headersWithIp,
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify(clientSignals),
    });

    const result = await res2.json();

    // 3. Display formatted Intelligence Output
    console.log(`    [!] SCORING COMPLETE >> Final Score: ${result.score}/100`);

    if (result.tier === "BOT") {
      console.log(`    [X] DETERMINATION  >> BOT CONFIRMED.`);
      console.log(
        `    [✓] ACTION         >> Traffic instantly rerouted to Generative LLM Honeypot.`,
      );

      // 4. Inject a fake Web3 RPC sequence to trigger the polymorphic honeypot backend
      // We simulate a real MetaMask Drainer sequence so the Trophy Room catches it.
      const sequence = [
        "eth_chainId",
        "eth_accounts",
        "eth_getBalance",
        "eth_sendTransaction",
      ];

      console.log(
        `    [*] INJECTING      >> Sending fake payload sequence to backend: [${sequence.join(
          ", ",
        )}]${sourceIp ? ` (Source IP: ${sourceIp})` : ""}`,
      );

      const sessionId =
        "sim-" +
        Date.now().toString() +
        "-" +
        Math.random().toString(36).slice(2, 6);

      for (let i = 0; i < sequence.length; i++) {
        const method = sequence[i];
        let params: any[] = [];

        if (method === "eth_getBalance") {
          params = ["0xAttacker...", "latest"];
        } else if (method === "eth_sendTransaction") {
          params = [
            {
              from: "0xAttacker...",
              to: "0xBaitWallet001...",
              value: "0xDE0B6B3A7640000", // 1 ETH
            },
          ];
        }

        await fetch(`${API_BASE}/api/rpc`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BB-Threat-Score": result.score.toString(),
            "X-BB-Tier": result.tier,
            "X-BB-Session": sessionId,
            ...headersWithIp,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: i + 1,
          }),
        });

        // Slight delay between RPC calls to simulate script execution time
        await delay(200);
      }

      // 5. Flush the session so the threat record persists to the DB and appears in the feed
      await fetch("http://localhost:8000/api/flush", { method: "POST" }).catch(
        () => {},
      );

      console.log(
        `    [✓] INJECTED       >> Backend ingested & flushed sequence.\n`,
      );
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
      (err as Error).message,
      "\n",
    );
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

runAttackSequence().catch(console.error);
