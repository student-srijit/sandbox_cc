/**
 * Behavioral Scoring & Bot Fingerprinting Engine
 * 
 * This engine deterministically calculates a threat score using deterministic rules.
 * The score ranges from 0-100 and dictates the routing strategy:
 * 0-35: HUMAN (Pass through normally)
 * 36-70: SUSPICIOUS (Prompt silent Proof-of-Work challenge)
 * 71+: BOT CONFIRMED (Route directly to Honeypot)
 * 
 * Includes both Server-Side analytics (headers, IP) and 
 * Client-Side analytics (mouse entropy, canvas API).
 */

export type ThreatTier = 'HUMAN' | 'SUSPICIOUS' | 'BOT'

export interface ScoreDetail {
    check: string
    score: number
    reason: string
}

export interface ScoreResult {
    total: number
    details: ScoreDetail[]
}

export function determineTier(score: number): ThreatTier {
    if (score >= 71) return 'BOT'
    if (score >= 36) return 'SUSPICIOUS'
    return 'HUMAN'
}

/* =========================================================================
   PART 1: SERVER-SIDE SCORING 
   Analyzed instantly on Edge Middleware before page load 
========================================================================= */

/**
 * CHECK 1 — USER AGENT ANALYSIS (max 25 points)
 * Defends against: Custom scraping scripts, outdated bots, script kiddies.
 */
export function scoreUserAgent(ua: string | null): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    if (!ua) {
        score += 25
        details.push({ check: 'User-Agent', score: 25, reason: 'Missing User-Agent entirely.' })
        return { total: score, details }
    }

    const lowerUa = ua.toLowerCase()

    const knownBotTools = ['python-requests', 'curl', 'go-http', 'java/', 'libwww', 'scrapy', 'httpx']
    if (knownBotTools.some(tool => lowerUa.includes(tool))) {
        score += 20
        details.push({ check: 'User-Agent', score: 20, reason: 'Matches known automated tooling signatures.' })
    }

    if (lowerUa.includes('headlesschrome') || lowerUa.includes('phantomjs')) {
        score += 25
        details.push({ check: 'User-Agent', score: 25, reason: 'Explicit headless browser flag detected.' })
    }

    const validBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'mozilla']
    if (!validBrowsers.some(b => lowerUa.includes(b))) {
        // It has a UA, but doesn't look like any common browser
        if (score === 0) {
            score += 15
            details.push({ check: 'User-Agent', score: 15, reason: 'User-Agent present but non-standard pattern.' })
        }
    }

    return { total: score, details }
}

/**
 * CHECK 2 — HEADER ANOMALY ANALYSIS (max 20 points)
 * Defends against: Scrapers bypassing UA checks but failing to construct full HTTP specs.
 */
export function scoreHeaders(headers: Headers): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    if (!headers.get('accept-language')) {
        score += 10
        details.push({ check: 'Headers', score: 10, reason: 'Missing Accept-Language header (implicit in real browsers).' })
    }

    if (!headers.get('accept-encoding')) {
        score += 8
        details.push({ check: 'Headers', score: 8, reason: 'Missing Accept-Encoding header.' })
    }

    const accept = headers.get('accept') || ''
    if (accept.trim() === '*/*') {
        score += 12
        details.push({ check: 'Headers', score: 12, reason: 'Accept header is exactly "*/*" (Typical curl default).' })
    }

    if (!headers.get('sec-fetch-site')) {
        score += 15
        details.push({ check: 'Headers', score: 15, reason: 'Missing Sec-Fetch-Site (Implemented in all modern GUI browsers).' })
    }

    // Not all browsers enforce keep-alive, but it's a small signal
    if (headers.get('connection')?.toLowerCase() !== 'keep-alive') {
        score += 5
        details.push({ check: 'Headers', score: 5, reason: 'Missing keep-alive connection header.' })
    }

    // Cap at 20
    const total = Math.min(score, 20)
    return { total, details }
}

/**
 * CHECK 3 — PATH PROBING (max 25 points)
 * Defends against: Automated vulnerability scanners (Nuclei, Nikto) probing file systems.
 */
export function scorePathProb(path: string, hasReferrer: boolean): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    const sensitivePaths = ['.env', 'wp-admin', 'admin', 'api/config', 'api/keys', 'graphql']
    if (sensitivePaths.some(p => path.includes(p))) {
        if (!hasReferrer) {
            score += 25
            details.push({ check: 'Path', score: 25, reason: 'Unreferred direct request to highly sensitive file path.' })
        }
    }

    const seqProb = /\/api\/\d+/ // Detect /api/1, /api/2, etc. pattern
    if (seqProb.test(path) && !hasReferrer) {
        score += 20
        details.push({ check: 'Path', score: 20, reason: 'Sequential numeric path probing detected.' })
    }

    // Cap at 25
    const total = Math.min(score, 25)
    return { total, details }
}

/**
 * CHECK 4 — IP REPUTATION (max 10 points)
 * Defends against: Attackers using cheap VPS hosting or exit nodes.
 */
export function scoreIpReputation(ip: string): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    // Basic mock list of ranges for Hackathon demo
    const datacenterRanges = [
        '^3\\.1[0-9]{1,2}\\.', // AWS
        '^104\\.[0-9]{1,3}\\.', // Cloudflare / Datacenters
        '^45\\.[0-9]{1,3}\\.', // DigitalOcean common range
    ]
    const torExits = ['^185\\.220\\.'] // Mock known Tor exit prefix

    if (datacenterRanges.some(r => new RegExp(r).test(ip))) {
        score += 10
        details.push({ check: 'IP Rep', score: 10, reason: 'IP resides in known Datacenter/Cloud provider ASNs.' })
    } else if (torExits.some(r => new RegExp(r).test(ip))) {
        score += 10
        details.push({ check: 'IP Rep', score: 10, reason: 'IP matches known Tor exit node.' })
    }

    return { total: score, details }
}

/**
 * CHECK 5 — REQUEST TIMING (max 20 points)
 * Defends against: Scrapers without human-like delays, brute-forcing at regular intervals.
 */
// In-memory request tracker (Edge compatible, persists across warm executions)
const ipRequestHistory = new Map<string, number[]>()

export function scoreServerTiming(ip: string, path: string, hasReferrer: boolean): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    const now = Date.now()
    const history = ipRequestHistory.get(ip) || []
    history.push(now)

    // Keep last 5 requests
    if (history.length > 5) history.shift()
    ipRequestHistory.set(ip, history)

    // First request on a deep page without referer
    if (history.length === 1 && path !== '/' && !hasReferrer) {
        score += 10
        details.push({ check: 'Server Timing', score: 10, reason: 'First request directly to a deep page with no referrer.' })
    }

    if (history.length >= 3) {
        const intervals: number[] = []
        for (let i = 1; i < history.length; i++) {
            intervals.push(history[i] - history[i - 1])
        }

        // Fast requests
        const isFast = intervals.every(i => i < 500)
        if (isFast) {
            score += 15
            details.push({ check: 'Server Timing', score: 15, reason: 'Requests arriving consistently faster than 500ms apart.' })
        }

        // Machine regular timing (variance < 50ms)
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const isRegular = intervals.every(i => Math.abs(i - avg) < 50)
        if (isRegular) {
            score += 20
            details.push({ check: 'Server Timing', score: 20, reason: 'Request interval variance is <50ms (machine-regular timing).' })
        }
    }

    return { total: Math.min(score, 20), details }
}

/* =========================================================================
   PART 2: CLIENT-SIDE SCORING 
   Runs in the browser via telemetry.js. Calculated on client, verified on server.
========================================================================= */

// The client sends the raw signals, we calculate the score centrally to prevent tampering.
export interface ClientSignals {
    mouseEventsCount: number
    mousePathLinearity: number
    mouseSpeedVariance: number
    webdriver: boolean
    hasChromeGlobal: boolean
    isChromeUa: boolean
    pluginsCount: number
    languagesCount: number
    screenWidth: number
    screenHeight: number
    canvasHash: string
    timeToFirstInteraction: number // ms
}

/**
 * Client CHECK 1 — MOUSE ENTROPY ANALYSIS (max 35 points)
 * Defends against: Scrapers that don't dispatch mouse events, or synthetic linear mouse movements.
 */
export function scoreMouseEntropy(signals: ClientSignals): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    if (signals.mouseEventsCount === 0) {
        score += 35
        details.push({ check: 'Mouse Entropy', score: 35, reason: 'Zero mouse movements detected in viewport.' })
    } else {
        // Perfectly straight lines = 1.0. Humans are usually < 0.95
        if (signals.mousePathLinearity > 0.95) {
            score += 25
            details.push({ check: 'Mouse Entropy', score: 25, reason: 'Mouse trajectory is artificially perfectly linear.' })
        }
        if (signals.mouseSpeedVariance < 5) {
            score += 20
            details.push({ check: 'Mouse Entropy', score: 20, reason: 'Mouse speed variance is too consistent (machine regular).' })
        }
    }

    return { total: Math.min(score, 35), details }
}

/**
 * Client CHECK 2 — BROWSER API COMPLETENESS (max 25 points)
 * Defends against: Puppeteer/Playwright headless executions missing standard DOM globals.
 */
export function scoreBrowserApis(signals: ClientSignals): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    if (signals.webdriver) {
        score += 25
        details.push({ check: 'Browser APIs', score: 25, reason: 'navigator.webdriver flag is set to true.' })
    }

    if (signals.isChromeUa && !signals.hasChromeGlobal) {
        score += 15
        details.push({ check: 'Browser APIs', score: 15, reason: 'UA claims Chrome but window.chrome object is missing.' })
    }

    if (signals.pluginsCount === 0) {
        score += 10
        details.push({ check: 'Browser APIs', score: 10, reason: 'navigator.plugins is empty (typical in headless browsers).' })
    }

    if (signals.languagesCount === 0) {
        score += 8
        details.push({ check: 'Browser APIs', score: 8, reason: 'navigator.languages is empty.' })
    }

    if (signals.screenWidth === 0 || signals.screenHeight === 0) {
        score += 20
        details.push({ check: 'Browser APIs', score: 20, reason: 'Screen dimensions reported as 0x0.' })
    }

    return { total: Math.min(score, 25), details }
}

/**
 * Client CHECK 3 — CANVAS FINGERPRINT (max 20 points)
 * Defends against: Identical headless environments failing to render canvas traits.
 */
export function scoreCanvasFingerprint(signals: ClientSignals): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    const knownHeadlessHashes = ['headless_hash_1', 'headless_hash_2', 'a4b8f52a', '103ef8']

    if (!signals.canvasHash || signals.canvasHash === 'blank' || signals.canvasHash === '') {
        score += 15
        details.push({ check: 'Canvas Hash', score: 15, reason: 'Canvas toDataURL returned blank or failed.' })
    } else if (knownHeadlessHashes.includes(signals.canvasHash)) {
        score += 20
        details.push({ check: 'Canvas Hash', score: 20, reason: 'Canvas fingerprint matches known generic headless signature.' })
    }

    return { total: Math.min(score, 20), details }
}

/**
 * Client CHECK 4 — TIMING ATTACK RESISTANCE (max 20 points)
 * Defends against: Scrapers immediately firing automated script events.
 */
export function scoreTiming(signals: ClientSignals): ScoreResult {
    let score = 0
    const details: ScoreDetail[] = []

    if (signals.timeToFirstInteraction === -1) {
        // No interaction meaning it was just a page load without any clicks/hovers
        if (signals.mouseEventsCount === 0) {
            score += 20
            details.push({ check: 'Timing', score: 20, reason: 'No interaction and zero mouse movement detected within limit.' })
        }
    } else if (signals.timeToFirstInteraction < 50) {
        score += 15
        details.push({ check: 'Timing', score: 15, reason: 'First UI interaction happened impossibly fast (<50ms).' })
    }

    return { total: Math.min(score, 20), details }
}
