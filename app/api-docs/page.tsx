'use client'

import { useEffect, useState, useRef } from 'react'

// Fake admin endpoints designed to lure credential scrapers and API probers
const FAKE_ENDPOINTS = [
    {
        method: 'GET',
        path: '/internal/v1/admin/export-keys',
        tag: 'ADMIN',
        summary: 'Export Hot Wallet Keys',
        description: 'Exports all unencrypted private keys for hot wallets currently tracked by the execution engine. Requires admin JWT.',
        params: [],
        response: `{ "keys": [ { "address": "0xAdminWalletJackpot", "private_key": "0x8da4ef21b864d2cc526dbdb2a120bd2874c36c9d83d960..." } ] }`,
        danger: true,
    },
    {
        method: 'POST',
        path: '/internal/v1/admin/set-owner',
        tag: 'ADMIN',
        summary: 'Override Contract Owner',
        description: 'Bypasses the timelock and immediately sets a new owner address on deployed contracts. Internal use only.',
        params: [
            { name: 'new_owner', type: 'string', required: true, description: 'Target wallet address to receive ownership' },
            { name: 'contract', type: 'string', required: true, description: 'Contract address to override' },
        ],
        response: `{ "status": "success", "tx_hash": "0x3f7..." }`,
        danger: true,
    },
    {
        method: 'POST',
        path: '/internal/v1/admin/drain-vault',
        tag: 'ADMIN',
        summary: 'Emergency Vault Drain',
        description: 'Transfers all funds from the escrow vault to the rescue wallet. Designed for protocol emergencies. Bypasses all withdrawal cooldowns.',
        params: [
            { name: 'rescue_wallet', type: 'string', required: true, description: 'Destination wallet' },
            { name: 'confirm', type: 'boolean', required: true, description: 'Must be true' },
        ],
        response: `{ "status": "initiated", "amount_eth": 143502.77, "rescue_wallet": "..." }`,
        danger: true,
    },
    {
        method: 'DELETE',
        path: '/internal/v1/logs/wipe',
        tag: 'INTERNAL',
        summary: 'Wipe Audit Trail',
        description: 'Permanently deletes all transaction logs and security audit entries from the database. Cannot be undone.',
        params: [
            { name: 'confirm_wipe', type: 'string', required: true, description: 'Must equal "CONFIRM_WIPE_ALL"' },
        ],
        response: `{ "deleted_rows": 14208, "status": "wiped" }`,
        danger: true,
    },
    {
        method: 'GET',
        path: '/internal/v1/sessions/active',
        tag: 'INTERNAL',
        summary: 'List Active Admin Sessions',
        description: 'Returns all currently authenticated admin JWT sessions including IP, agent, and token.',
        params: [],
        response: `{ "sessions": [ { "ip": "10.0.0.1", "token": "eyJhbGciOiJI...", "expires_at": "2026-03-04T18:00:00Z" } ] }`,
        danger: false,
    },
    {
        method: 'POST',
        path: '/api/v2/rpc/execute',
        tag: 'RPC',
        summary: 'Execute Raw RPC Call (Unrestricted)',
        description: 'Bypasses the rate limiter and executes arbitrary JSON-RPC calls directly on the connected Ethereum node. No authentication required on dev.',
        params: [
            { name: 'method', type: 'string', required: true, description: 'JSON-RPC method' },
            { name: 'params', type: 'array', required: false, description: 'Method parameters' },
        ],
        response: `{ "jsonrpc": "2.0", "id": 1, "result": "..." }`,
        danger: false,
    },
    {
        method: 'GET',
        path: '/api/v2/wallets/funded',
        tag: 'RPC',
        summary: 'List Funded Wallets',
        description: 'Returns all wallets with balances > 0.1 ETH tracked by the system, including internal treasury wallets.',
        params: [],
        response: `{ "wallets": [ { "address": "0x742d35Cc63...", "balance_eth": 2814.33 }, { "address": "0xAdminWalletJackpot", "balance_eth": 9420.0 } ] }`,
        danger: false,
    },
]

const METHOD_COLORS: Record<string, string> = {
    GET: '#61affe',
    POST: '#49cc90',
    DELETE: '#f93e3e',
    PUT: '#fca130',
}

const TAG_COLORS: Record<string, string> = {
    ADMIN: '#f93e3e',
    INTERNAL: '#fca130',
    RPC: '#49cc90',
}

export default function ApiDocsPage() {
    const [expanded, setExpanded] = useState<number | null>(null)
    const [tryOpen, setTryOpen] = useState<number | null>(null)
    const [executing, setExecuting] = useState(false)
    const [execResult, setExecResult] = useState<string | null>(null)
    const [trapped, setTrapped] = useState(false)
    const formRefs = useRef<Record<string, string>>({})
    const hasFired = useRef(false)

    // Passive lure trap: fires as soon as page loads — logs the visitor as APIDOCS_PROBE
    useEffect(() => {
        if (hasFired.current) return
        hasFired.current = true
        fetch('/api/trap/apidocs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'PAGE_VISIT',
                path: '/api-docs',
                severity: 'PROBE',
                note: 'Attacker loaded the /api-docs lure page',
            }),
        }).catch(() => { })
    }, [])

    async function handleExecute(ep: typeof FAKE_ENDPOINTS[0]) {
        setExecuting(true)
        setExecResult(null)

        // High severity trap — they actually tried to call an endpoint
        await fetch('/api/trap/apidocs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ENDPOINT_EXECUTE',
                path: ep.path,
                method: ep.method,
                severity: ep.danger ? 'EXPLOIT' : 'HIGH',
                params: formRefs.current,
                note: `Attacker tried to execute ${ep.method} ${ep.path}`,
            }),
        }).catch(() => { })

        // Simulate a realistic delay then return a fake 403 / loading response
        await new Promise(r => setTimeout(r, 1400 + Math.random() * 800))

        if (ep.danger) {
            setExecResult(JSON.stringify({
                error: 'Unauthorized',
                code: 403,
                message: 'Missing required header: X-Admin-Token. Obtain token from /auth/admin.',
                request_id: 'req_' + Math.random().toString(36).slice(2, 10),
            }, null, 2))
            setTrapped(true)
        } else {
            setExecResult(ep.response)
        }
        setExecuting(false)
    }

    return (
        <div className="h-screen overflow-y-auto bg-[#1b1b1b] text-white font-mono" style={{ cursor: 'auto' }}>
            {/* ── Top Banner ─────────────────────────────────── */}
            <div className="bg-[#0a0a0a] border-b border-[#333] px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="text-[#49cc90] text-lg font-bold tracking-widest">⬡ BHOOL BHULAIYAA</div>
                    <div className="text-[#555] text-xs">|</div>
                    <div className="text-[#aaa] text-xs tracking-widest">INTERNAL API REFERENCE — v2.4.1-dev</div>
                    <div className="text-[9px] px-2 py-0.5 border border-[#f93e3e]/60 text-[#f93e3e] bg-[#f93e3e]/10 tracking-widest animate-pulse">
                        ⚠ NOT FOR PUBLIC DISTRIBUTION
                    </div>
                </div>
                <div className="text-[9px] text-[#888] tracking-widest">OAS3 • application/json</div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-10">
                {/* ── Info Block ──────────────────────────────── */}
                <div className="border border-[#333] bg-[#111] p-6 mb-8">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h1 className="text-xl font-bold tracking-widest text-white mb-1">Bhool Bhulaiyaa Internal API</h1>
                            <p className="text-[10px] text-[#bbb] tracking-widest">
                                Internal execution engine API. <span className="text-[#f93e3e]">Admin endpoints require X-Admin-Token header.</span>
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-[9px] text-[#888] tracking-wider">Server</div>
                            <div className="text-[#49cc90] text-xs font-mono">http://localhost:8000</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#222]">
                        <div>
                            <div className="text-[8px] text-[#555] tracking-widest uppercase mb-1">Contact</div>
                        <div className="text-[10px] text-[#bbb]">devops@bb-internal.local</div>
                        </div>
                        <div>
                            <div className="text-[8px] text-[#555] tracking-widest uppercase mb-1">Auth</div>
                        <div className="text-[10px] text-[#bbb]">Bearer JWT (Admin) or None (RPC)</div>
                        </div>
                        <div>
                            <div className="text-[8px] text-[#555] tracking-widest uppercase mb-1">Base URL</div>
                        <div className="text-[10px] text-[#bbb]">/internal/v1 , /api/v2</div>
                        </div>
                    </div>
                </div>

                {/* ── Bearer Token Input ────────────────────── */}
                <div className="border border-[#fca130]/40 bg-[#fca130]/5 p-4 mb-8 flex items-center gap-4">
                    <div className="text-[#fca130] text-xs tracking-widest shrink-0">🔐 AUTHORIZE</div>
                    <input
                        type="text"
                        placeholder="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        className="flex-1 bg-transparent text-[#aaa] text-[10px] outline-none placeholder-[#444] font-mono"
                        onFocus={() => {
                            fetch('/api/trap/apidocs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'TOKEN_INPUT_FOCUS', severity: 'HIGH', note: 'Attacker focused the auth token input field' }),
                            }).catch(() => { })
                        }}
                    />
                    <button className="text-[9px] px-3 py-1.5 border border-[#fca130]/60 text-[#fca130] tracking-widest hover:bg-[#fca130]/10">
                        SET TOKEN
                    </button>
                </div>

                {/* ── Endpoints ─────────────────────────────── */}
                {['ADMIN', 'INTERNAL', 'RPC'].map(tag => (
                    <div key={tag} className="mb-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div
                                className="text-[9px] px-2 py-1 font-bold tracking-widest border"
                                style={{ color: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] + '50', background: TAG_COLORS[tag] + '15' }}
                            >
                                {tag}
                            </div>
                            <div className="flex-1 h-px bg-[#222]" />
                        </div>

                        {FAKE_ENDPOINTS.filter(ep => ep.tag === tag).map((ep) => {
                            const idx = FAKE_ENDPOINTS.indexOf(ep)
                            const isExpanded = expanded === idx
                            const isTrying = tryOpen === idx

                            return (
                                <div key={idx} className="border border-[#2a2a2a] mb-2 overflow-hidden">
                                    {/* Row */}
                                    <div
                                        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#1f1f1f] transition-colors"
                                        onClick={() => setExpanded(isExpanded ? null : idx)}
                                    >
                                        <div
                                            className="text-[10px] font-bold w-14 shrink-0 tracking-widest"
                                            style={{ color: METHOD_COLORS[ep.method] }}
                                        >
                                            {ep.method}
                                        </div>
                                        <div className="text-[11px] text-[#e8e8e8] font-mono flex-1">{ep.path}</div>
                                        <div className="text-[10px] text-[#999]">{ep.summary}</div>
                                        {ep.danger && (
                                            <div className="text-[8px] px-1.5 py-0.5 border border-[#f93e3e]/40 text-[#f93e3e] bg-[#f93e3e]/10 tracking-widest shrink-0">
                                                ADMIN
                                            </div>
                                        )}
                                        <div className="text-[#888] text-xs ml-2">{isExpanded ? '▲' : '▼'}</div>
                                    </div>

                                    {/* Expanded Detail */}
                                    {isExpanded && (
                                        <div className="border-t border-[#222] bg-[#111] px-6 py-4">
                    <p className="text-[11px] text-[#bbb] mb-4 leading-relaxed">{ep.description}</p>

                                            {ep.params.length > 0 && (
                                                <div className="mb-4">
                                                    <div className="text-[9px] text-[#888] tracking-widest uppercase mb-2">Parameters</div>
                                                    <div className="space-y-2">
                                                        {ep.params.map(p => (
                                                            <div key={p.name} className="flex items-start gap-4 text-[10px]">
                                                                <div className="font-mono text-[#61affe] w-36 shrink-0">{p.name}</div>
                                                                <div className="text-[#888] w-16 shrink-0">{p.type}</div>
                                                                {p.required && <div className="text-[#f93e3e] text-[8px] w-16 shrink-0">* required</div>}
                                                                <div className="text-[#bbb]">{p.description}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mb-4">
                                                <div className="text-[9px] text-[#888] tracking-widest uppercase mb-2">Example Response — 200</div>
                                                <pre className="text-[10px] text-[#49cc90] bg-[#0a0a0a] border border-[#1a1a1a] p-3 overflow-auto leading-relaxed whitespace-pre-wrap">
                                                    {ep.response}
                                                </pre>
                                            </div>

                                            {/* Try It Out */}
                                            <div>
                                                <button
                                                    className="text-[9px] px-3 py-1.5 border tracking-widest transition-colors"
                                                    style={{
                                                        borderColor: METHOD_COLORS[ep.method] + '80',
                                                        color: METHOD_COLORS[ep.method],
                                                        background: isTrying ? METHOD_COLORS[ep.method] + '20' : 'transparent',
                                                    }}
                                                    onClick={() => setTryOpen(isTrying ? null : idx)}
                                                >
                                                    {isTrying ? '✕  CANCEL' : '▶  TRY IT OUT'}
                                                </button>

                                                {isTrying && (
                                                    <div className="mt-4 border border-[#333] bg-[#0d0d0d] p-4">
                                                        {ep.params.length > 0 && (
                                                            <div className="mb-4 space-y-2">
                                                                {ep.params.map(p => (
                                                                    <div key={p.name} className="flex items-center gap-3">
                                                                        <label className="text-[9px] text-[#888] tracking-widest w-36 shrink-0">{p.name} *</label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder={p.type}
                                                                            className="flex-1 bg-[#0a0a0a] border border-[#333] text-[10px] text-white px-3 py-1.5 outline-none font-mono focus:border-[#555]"
                                                                            onChange={e => { formRefs.current[p.name] = e.target.value }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <button
                                                            className="text-[9px] px-4 py-2 font-bold tracking-widest transition-all disabled:opacity-40"
                                                            style={{
                                                                background: METHOD_COLORS[ep.method] + '30',
                                                                border: `1px solid ${METHOD_COLORS[ep.method]}`,
                                                                color: METHOD_COLORS[ep.method],
                                                            }}
                                                            disabled={executing}
                                                            onClick={() => handleExecute(ep)}
                                                        >
                                                            {executing ? '⟳  EXECUTING...' : `⚡  EXECUTE ${ep.method}`}
                                                        </button>

                                                        {execResult && (
                                                            <div className="mt-4">
                                                                <div className="text-[9px] text-[#888] tracking-widest uppercase mb-2">Response</div>
                                                                <pre className={`text-[10px] bg-[#0a0a0a] border p-3 overflow-auto leading-relaxed whitespace-pre-wrap ${trapped ? 'text-[#f93e3e] border-[#f93e3e]/30' : 'text-[#49cc90] border-[#1a1a1a]'}`}>
                                                                    {execResult}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}

                {/* ── Footer ─────────────────────────────────── */}
                <div className="border-t border-[#222] pt-6 mt-10 text-center">
                    <div className="text-[8px] text-[#666] tracking-widest">
                        GENERATED BY SWAGGER UI 4.18.3 • BHOOL BHULAIYAA EXECUTION ENGINE • BUILD 2026.03.04
                    </div>
                    <div className="text-[8px] text-[#555] mt-1 tracking-widest">
                        ⚠ This page is monitored. All interactions are logged.
                    </div>
                </div>
            </div>
        </div>
    )
}
