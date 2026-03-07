import Link from 'next/link'
import { CHAIN_LABEL, getContractsForChain, isContractsConfigured, type SupportedChain } from '@/lib/contracts'
import { SUPPORTED_CHAINS } from '@/lib/web3/chains'
import CustomCursor from '@/components/CustomCursor'

const CHAINS: SupportedChain[] = [11155111, 11142220]

function shortAddress(value: string) {
  if (!value || !value.startsWith('0x') || value.length < 12) return 'Not configured'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export default function Web3HubPage() {
  return (
    <main className="min-h-screen bg-[#05070b] px-6 py-10 text-[#eaf4ff]">
      <CustomCursor />
      <section className="mx-auto max-w-6xl">
        <div className="rounded-md border border-[#203046] bg-[linear-gradient(135deg,#091423_0%,#081b16_50%,#0d1829_100%)] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
          <p className="text-[11px] tracking-[0.32em] uppercase text-[#7bbcf3]">Web3 Operations Hub</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Cyber Commerce & Onchain Evidence</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#9fb6cc]">
            This war-room stack is connected to real deployments on Sepolia and Celo Sepolia.
            Use Vault for NFT access and bounty workflows, then use Ledger for immutable incident evidence.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/vault"
              className="rounded border border-[#2a8a5b] bg-[#0f2b1d] px-4 py-2 text-[11px] tracking-[0.2em] uppercase text-[#67f8ab] hover:bg-[#143526]"
            >
              Open Vault
            </Link>
            <Link
              href="/ledger"
              className="rounded border border-[#355d92] bg-[#13233a] px-4 py-2 text-[11px] tracking-[0.2em] uppercase text-[#9cc9ff] hover:bg-[#173050]"
            >
              Open Ledger
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {CHAINS.map((chainId) => {
            const contracts = getContractsForChain(chainId)
            const configured = isContractsConfigured(contracts)
            const chain = SUPPORTED_CHAINS[chainId]

            return (
              <article key={chainId} className="rounded-md border border-[#23364f] bg-[#0a111d] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{CHAIN_LABEL[chainId]}</h2>
                    <p className="mt-1 text-xs text-[#8aa0b8]">Chain ID {chainId} • {chain.nativeCurrency.symbol}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] tracking-[0.18em] uppercase ${configured ? 'bg-[#0f3123] text-[#67f8ab]' : 'bg-[#321616] text-[#ff8b8b]'}`}>
                    {configured ? 'Configured' : 'Incomplete'}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-[#17263a] pb-1"><span className="text-[#86a0b8]">EvidenceAttestation</span><span>{shortAddress(contracts.evidenceAttestation)}</span></div>
                  <div className="flex justify-between border-b border-[#17263a] pb-1"><span className="text-[#86a0b8]">ReportAccessNFT</span><span>{shortAddress(contracts.reportAccessNFT)}</span></div>
                  <div className="flex justify-between border-b border-[#17263a] pb-1"><span className="text-[#86a0b8]">EnterpriseLicenseNFT</span><span>{shortAddress(contracts.enterpriseLicenseNFT)}</span></div>
                  <div className="flex justify-between border-b border-[#17263a] pb-1"><span className="text-[#86a0b8]">BountyEscrow</span><span>{shortAddress(contracts.bountyEscrow)}</span></div>
                  <div className="flex justify-between"><span className="text-[#86a0b8]">StableToken</span><span>{shortAddress(contracts.stableToken)}</span></div>
                </div>

                <a
                  href={chain.blockExplorerUrls[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-[11px] tracking-[0.12em] text-[#8dc4ff] hover:text-white"
                >
                  Open Explorer
                </a>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}
