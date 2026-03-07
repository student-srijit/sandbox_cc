import { NextRequest, NextResponse } from 'next/server'

type SupportedChain = 'sepolia' | 'celo-sepolia'

type ExplorerTx = {
  blockNumber: string
  timeStamp: string
  hash: string
  nonce: string
  blockHash: string
  transactionIndex: string
  from: string
  to: string
  value: string
  gas: string
  gasPrice: string
  isError: string
  txreceipt_status: string
  input: string
  contractAddress: string
  cumulativeGasUsed: string
  gasUsed: string
  confirmations: string
  methodId?: string
  functionName?: string
  tokenName?: string
  tokenSymbol?: string
  tokenDecimal?: string
}

type ExplorerResponse = {
  status: string
  message: string
  result: ExplorerTx[] | string
}

const EXPLORER_CONFIG: Record<SupportedChain, { apiBase: string; apiKeyEnv: string; explorerBase: string }> = {
  sepolia: {
    apiBase: 'https://api-sepolia.etherscan.io/api',
    apiKeyEnv: 'ETHERSCAN_API_KEY',
    explorerBase: 'https://sepolia.etherscan.io',
  },
  'celo-sepolia': {
    apiBase: 'https://api-sepolia.celoscan.io/api',
    apiKeyEnv: 'CELOSCAN_API_KEY',
    explorerBase: 'https://celo-sepolia.blockscout.com',
  },
}

function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

async function fetchExplorerTxs(
  chain: SupportedChain,
  address: string,
  action: 'txlist' | 'tokentx',
  pageSize: number,
) {
  try {
    const config = EXPLORER_CONFIG[chain]
    const apiKey = process.env[config.apiKeyEnv] || ''

    const params = new URLSearchParams({
      module: 'account',
      action,
      address,
      startblock: '0',
      endblock: '99999999',
      page: '1',
      offset: String(pageSize),
      sort: 'desc',
    })

    if (apiKey) {
      params.set('apikey', apiKey)
    }

    const res = await fetch(`${config.apiBase}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!res.ok) {
      return []
    }

    const data = (await res.json()) as ExplorerResponse
    if (!Array.isArray(data.result)) {
      return []
    }

    return data.result
  } catch {
    // Do not fail the API if explorer upstream is temporarily unavailable.
    return []
  }
}

function toUnifiedTx(chain: SupportedChain, tx: ExplorerTx) {
  const config = EXPLORER_CONFIG[chain]
  const isToken = Boolean(tx.tokenSymbol)
  const decimals = Number(tx.tokenDecimal || '18')
  const rawValue = tx.value || '0'

  let formattedValue = '0'
  try {
    const padded = rawValue.padStart(decimals + 1, '0')
    const integerPart = padded.slice(0, -decimals)
    const decimalPart = padded.slice(-decimals).replace(/0+$/, '')
    formattedValue = decimalPart ? `${integerPart}.${decimalPart}` : integerPart
  } catch {
    formattedValue = rawValue
  }

  return {
    chain,
    hash: tx.hash,
    timestamp: Number(tx.timeStamp || '0') * 1000,
    blockNumber: tx.blockNumber,
    from: tx.from,
    to: tx.to,
    value: formattedValue,
    symbol: isToken ? tx.tokenSymbol : chain === 'celo-sepolia' ? 'CELO' : 'ETH',
    status: tx.isError === '1' || tx.txreceipt_status === '0' ? 'failed' : 'success',
    kind: isToken ? 'token' : 'native',
    explorerUrl: `${config.explorerBase}/tx/${tx.hash}`,
    functionName: tx.functionName || '',
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const address = (req.nextUrl.searchParams.get('address') || '').trim()
    const chain = (req.nextUrl.searchParams.get('chain') || 'celo-sepolia') as SupportedChain
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || '25'), 1), 100)

    if (!isAddressLike(address)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    if (!(chain in EXPLORER_CONFIG)) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 })
    }

    const [nativeTxs, tokenTxs] = await Promise.all([
      fetchExplorerTxs(chain, address, 'txlist', limit),
      fetchExplorerTxs(chain, address, 'tokentx', limit),
    ])

    const dedup = new Map<string, ReturnType<typeof toUnifiedTx>>()

    for (const tx of nativeTxs) {
      dedup.set(`native:${tx.hash}`, toUnifiedTx(chain, tx))
    }

    for (const tx of tokenTxs) {
      dedup.set(`token:${tx.hash}:${tx.tokenSymbol || 'token'}`, toUnifiedTx(chain, tx))
    }

    const txs = Array.from(dedup.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)

    return NextResponse.json({
      address,
      chain,
      total: txs.length,
      transactions: txs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message, transactions: [] }, { status: 500 })
  }
}
