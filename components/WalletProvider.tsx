'use client'

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { DEFAULT_CHAIN_ID, SUPPORTED_CHAINS, type SupportedChainId } from '@/lib/web3/chains'

interface EthereumProvider {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    on: (event: string, listener: (...args: unknown[]) => void) => void
    removeListener: (event: string, listener: (...args: unknown[]) => void) => void
}

type WindowWithEthereum = Window & {
    ethereum?: EthereumProvider
}

interface WalletContextType {
    address: string | null
    balance: string | null
    chainId: number | null
    preferredChainId: SupportedChainId
    missingMetaMask: boolean
    isActive: boolean
    connectWallet: () => Promise<void>
    setPreferredChainId: (chainId: SupportedChainId) => void
    switchChain: (targetChainId: SupportedChainId) => Promise<boolean>
    dismissModal: () => void
}

const WalletContext = createContext<WalletContextType>({
    address: null,
    balance: null,
    chainId: null,
    preferredChainId: DEFAULT_CHAIN_ID,
    missingMetaMask: false,
    isActive: false,
    connectWallet: async () => {},
    setPreferredChainId: () => { },
    switchChain: async () => false,
    dismissModal: () => { },
})

export function useWallet() {
    return useContext(WalletContext)
}

const PREFERRED_CHAIN_STORAGE_KEY = 'bb-preferred-chain'

// Module-level mutex — survives React Fast Refresh remounts so we never fire
// a duplicate wallet_addEthereumChain while a MetaMask popup is already open.
let chainSwitchInFlight = false

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [address, setAddress] = useState<string | null>(null)
    const [balance, setBalance] = useState<string | null>(null)
    const [chainId, setChainId] = useState<number | null>(null)
    const [preferredChainId, setPreferredChainIdState] = useState<SupportedChainId>(DEFAULT_CHAIN_ID)
    const [missingMetaMask, setMissingMetaMask] = useState(false)
    const [isActive, setIsActive] = useState(false)

    const dismissModal = () => setMissingMetaMask(false)

    const setPreferredChainId = useCallback((nextChainId: SupportedChainId) => {
        setPreferredChainIdState(nextChainId)
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(PREFERRED_CHAIN_STORAGE_KEY, String(nextChainId))
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const stored = window.localStorage.getItem(PREFERRED_CHAIN_STORAGE_KEY)
        if (!stored) return

        const parsed = Number(stored)
        if (parsed === 11155111 || parsed === 11142220) {
            setPreferredChainIdState(parsed)
        }
    }, [])

    const switchChain = useCallback(async (targetChainId: SupportedChainId): Promise<boolean> => {
        if (typeof window === 'undefined' || !(window as WindowWithEthereum).ethereum) {
            setMissingMetaMask(true)
            return false
        }

        const eth = (window as WindowWithEthereum).ethereum
        if (!eth) {
            setMissingMetaMask(true)
            return false
        }

        // Guard against concurrent switch attempts (causes MetaMask -32002)
        if (chainSwitchInFlight) return false
        chainSwitchInFlight = true

        const chain = SUPPORTED_CHAINS[targetChainId]

        try {
            await eth.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chain.chainHex }],
            })
            return true
        } catch (switchError: unknown) {
            const code =
                typeof switchError === 'object' && switchError !== null && 'code' in switchError
                    ? Number((switchError as { code?: unknown }).code)
                    : null

            // -32002: a wallet_addEthereumChain popup is already open — not an error, just skip
            if (code === -32002) {
                console.warn('Chain operation already pending in MetaMask — please confirm the MetaMask popup.')
                return false
            }

            // 4902: chain has not been added to wallet yet
            if (code === 4902) {
                try {
                    await eth.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: chain.chainHex,
                            chainName: chain.chainName,
                            nativeCurrency: chain.nativeCurrency,
                            rpcUrls: chain.rpcUrls,
                            blockExplorerUrls: chain.blockExplorerUrls,
                        }],
                    })
                    return true
                } catch (addError: unknown) {
                    const addCode =
                        typeof addError === 'object' && addError !== null && 'code' in addError
                            ? Number((addError as { code?: unknown }).code)
                            : null
                    // -32002: popup already open (duplicate call) — inform user to confirm popup
                    if (addCode === -32002) {
                        console.warn('Chain add already pending in MetaMask — please confirm the MetaMask popup.')
                    } else {
                        console.error('User rejected adding chain or wallet rejected params.', addError)
                    }
                    return false
                }
            }

            console.error('Chain switch rejected by wallet or user.', switchError)
            return false
        } finally {
            chainSwitchInFlight = false
        }
    }, [])

    const connectWallet = useCallback(async () => {
        // 1. Check for MetaMask
        if (typeof window === 'undefined' || !(window as WindowWithEthereum).ethereum) {
            setMissingMetaMask(true)
            return
        }

        try {
            const eth = (window as WindowWithEthereum).ethereum
            if (!eth) {
                setMissingMetaMask(true)
                return
            }

            // 2. Request accounts — no forced chain switch here.
            // The user can switch chains via the explicit "SWITCH IN WALLET" button.
            const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
            if (!accounts || accounts.length === 0) return

            const currentAddress = accounts[0]
            const provider = new ethers.BrowserProvider(eth)
            const network = await provider.getNetwork()

            // 3. Fetch Balance
            const balanceWei = await provider.getBalance(currentAddress)
            const balanceEth = parseFloat(ethers.formatEther(balanceWei)).toFixed(4)

            // 4. Update State
            setAddress(currentAddress)
            setBalance(balanceEth)
            setChainId(Number(network.chainId))
            setIsActive(true)

            // 5. Notify the Backend telemetry that a legitimate node was protected
            fetch('/api/protect', { method: 'POST' }).catch(() => {})

        } catch (err) {
            console.error('Error connecting wallet:', err)
        }
    }, [])

    // Handle account/chain changes
    useEffect(() => {
        if (typeof window === 'undefined' || !(window as WindowWithEthereum).ethereum) return
        const eth = (window as WindowWithEthereum).ethereum
        if (!eth) return

        const handleAccountsChanged = (...args: unknown[]) => {
            const accounts = Array.isArray(args[0])
                ? args[0].filter((value): value is string => typeof value === 'string')
                : []
            if (accounts.length === 0) {
                setIsActive(false)
                setAddress(null)
                setBalance(null)
            } else {
                // Just reconnect to fetch new balances
                connectWallet()
            }
        }

        const handleChainChanged = (...args: unknown[]) => {
            // Update chainId in-place so the vault/ledger pages don't lose wallet connection.
            // MetaMask recommends a reload but in-place update is better UX here.
            const newChainIdRaw = args[0] as string
            const newChainId = parseInt(newChainIdRaw, 16)
            if (!isNaN(newChainId)) {
                setChainId(newChainId)
            }
            // Re-fetch balance for the new chain
            connectWallet()
        }

        eth.on('accountsChanged', handleAccountsChanged)
        eth.on('chainChanged', handleChainChanged)

        return () => {
            eth.removeListener('accountsChanged', handleAccountsChanged)
            eth.removeListener('chainChanged', handleChainChanged)
        }
    }, [connectWallet])

    return (
        <WalletContext.Provider
            value={{
                address,
                balance,
                chainId,
                preferredChainId,
                missingMetaMask,
                isActive,
                connectWallet,
                setPreferredChainId,
                switchChain,
                dismissModal,
            }}
        >
            {children}

            {/* Missing MetaMask Modal */}
            {missingMetaMask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#0b0c10] border border-[rgba(255,0,60,0.5)] p-8 max-w-md w-full relative shadow-[0_0_30px_rgba(255,0,60,0.2)]">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FF003C] to-transparent" />

                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-full border border-[#FF003C] flex items-center justify-center text-[#FF003C] text-2xl">
                                !
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white uppercase tracking-widest">MetaMask Required</h3>
                                <p className="text-xs text-[#FF003C] font-mono tracking-widest mt-1">ERR_NO_PROVIDER_DETECTED</p>
                            </div>
                        </div>

                        <p className="text-sm text-[var(--text-dim)] mb-8 leading-relaxed">
                            To securely connect your wallet to the Bhool Bhulaiyaa network and bypass automated threat detection, you must have the legitimate MetaMask browser extension installed.
                        </p>

                        <div className="flex justify-end gap-4">
                            <button
                                onClick={dismissModal}
                                className="px-4 py-2 text-xs text-[var(--text-dim)] hover:text-white transition-colors uppercase tracking-widest"
                            >
                                Dismiss
                            </button>
                            <a
                                href="https://metamask.io/download/"
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-[rgba(255,0,60,0.1)] border border-[#FF003C] text-[#FF003C] hover:bg-[#FF003C] hover:text-white transition-all uppercase tracking-widest text-xs font-bold"
                            >
                                Install MetaMask
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </WalletContext.Provider>
    )
}
