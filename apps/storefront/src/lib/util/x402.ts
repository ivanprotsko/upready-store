import type { ErrorMessageKey } from "./error-messages"

/**
 * The storefront's half of the x402 provider (t-2026-10-03-33), kept free of
 * JSX so vitest can import it. The buyer pays in USDC: a browser wallet
 * (EIP-1193) signs an EIP-3009 `TransferWithAuthorization`, the signature goes
 * to the backend as the payment session's `payment_signature`, and the backend
 * verifies and settles it when the order is placed. The storefront calls no
 * RPC node and no facilitator.
 */

export const X402_PROVIDER_ID = "pp_x402_x402"

export const isX402 = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_x402_"))

export type X402Requirement = {
  scheme: "exact"
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: { name: string; version: string }
}

export type X402Resource = {
  url: string
  description?: string
  mimeType?: string
}

export type X402PaymentRequired = {
  x402Version: number
  resource: X402Resource
  accepts: X402Requirement[]
}

export type X402SessionData = {
  payment_required?: X402PaymentRequired | null
  settled_at?: string | null
  transaction?: string | null
  last_error?: string | null
}

type SessionLike = {
  provider_id?: string | null
  status?: string | null
  data?: Record<string, unknown> | null
}

export const x402SessionOf = (
  cart:
    | {
        payment_collection?: { payment_sessions?: SessionLike[] | null } | null
      }
    | null
    | undefined
): (SessionLike & { data: X402SessionData }) | null => {
  const session = cart?.payment_collection?.payment_sessions?.find((s) =>
    isX402(s.provider_id)
  )
  return session
    ? { ...session, data: (session.data ?? {}) as X402SessionData }
    : null
}

/** `eip155:84532` gives 84532; anything else gives null. */
export const chainIdOf = (network: string): number | null => {
  const match = /^eip155:(\d+)$/.exec(network)
  return match ? Number(match[1]) : null
}

export const isTestNetwork = (network: string) => chainIdOf(network) === 84532

/**
 * The entry on the wallet's current chain, else the first one. `walletChainId`
 * is a number, or the hex string `eth_chainId` answers.
 */
export const pickRequirement = (
  accepts: X402Requirement[],
  walletChainId?: number | string | null
): X402Requirement | null => {
  const wallet =
    typeof walletChainId === "string" ? Number(walletChainId) : walletChainId
  return (
    accepts.find(
      (entry) => wallet != null && chainIdOf(entry.network) === wallet
    ) ??
    accepts[0] ??
    null
  )
}

export const randomNonce = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return (
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  )
}

type AuthorizationOptions = { nowSeconds: number; nonce: string }

export const buildAuthorization = (
  requirement: X402Requirement,
  from: string,
  { nowSeconds, nonce }: AuthorizationOptions
) => ({
  from,
  to: requirement.payTo,
  value: requirement.amount,
  validAfter: String(nowSeconds - 600),
  validBefore: String(nowSeconds + requirement.maxTimeoutSeconds),
  nonce,
})

export const buildTransferTypedData = (
  requirement: X402Requirement,
  from: string,
  options: AuthorizationOptions
) => ({
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization" as const,
  domain: {
    name: requirement.extra.name,
    version: requirement.extra.version,
    chainId: chainIdOf(requirement.network) ?? 0,
    verifyingContract: requirement.asset,
  },
  message: buildAuthorization(requirement, from, options),
})

export const buildPaymentPayload = (
  paymentRequired: X402PaymentRequired,
  requirement: X402Requirement,
  from: string,
  signature: string,
  options: AuthorizationOptions
) => ({
  x402Version: 2,
  resource: paymentRequired.resource,
  // The very same object: the server compares it deep-equal with its own.
  accepted: requirement,
  payload: {
    signature,
    authorization: buildAuthorization(requirement, from, options),
  },
})

/** Base64 of the UTF-8 JSON, safe for non-ASCII text in `resource`. */
export const encodePaymentSignature = (payload: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const NATIVE = { name: "Ether", symbol: "ETH", decimals: 18 }

export const addChainParams = (chainId: number) => {
  if (chainId === 84532) {
    return {
      chainId: "0x14a34",
      chainName: "Base Sepolia",
      nativeCurrency: NATIVE,
      rpcUrls: ["https://sepolia.base.org"],
      blockExplorerUrls: ["https://sepolia.basescan.org"],
    }
  }
  if (chainId === 8453) {
    return {
      chainId: "0x2105",
      chainName: "Base",
      nativeCurrency: NATIVE,
      rpcUrls: ["https://mainnet.base.org"],
      blockExplorerUrls: ["https://basescan.org"],
    }
  }
  return null
}

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const errorCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "number" ? code : undefined
}

export type PayWithWalletResult =
  | { signature: string; requirement: X402Requirement }
  | { error: ErrorMessageKey }

/**
 * Connects the wallet, moves it to the payment network, signs the transfer
 * authorization and returns the `payment_signature` header value. A failure
 * comes back as an `Errors` key.
 */
export const payWithWallet = async (
  provider: Eip1193Provider | null | undefined,
  paymentRequired: X402PaymentRequired,
  {
    nowSeconds = Math.floor(Date.now() / 1000),
    nonce = randomNonce(),
  }: Partial<AuthorizationOptions> = {}
): Promise<PayWithWalletResult> => {
  if (!provider || typeof provider.request !== "function") {
    return { error: "x402WalletMissing" }
  }

  let account: string
  try {
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[]
    if (!accounts?.[0]) return { error: "x402WalletRejected" }
    account = accounts[0]
  } catch (error) {
    return {
      error:
        errorCode(error) === 4001 ? "x402WalletRejected" : "x402NetworkFailed",
    }
  }

  let requirement: X402Requirement | null
  try {
    const walletChainId = (await provider.request({
      method: "eth_chainId",
    })) as string
    requirement = pickRequirement(paymentRequired.accepts, walletChainId)
    const target = requirement ? chainIdOf(requirement.network) : null
    if (!requirement || target === null) return { error: "x402PaymentRefused" }

    if (Number(walletChainId) !== target) {
      const chainId = "0x" + target.toString(16)
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }],
        })
      } catch (error) {
        const params = errorCode(error) === 4902 ? addChainParams(target) : null
        if (!params) throw error
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [params],
        })
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }],
        })
      }
    }
  } catch (error) {
    return {
      error:
        errorCode(error) === 4001 ? "x402WalletRejected" : "x402NetworkFailed",
    }
  }

  const options = { nowSeconds, nonce }
  let signature: string
  try {
    signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [
        account,
        JSON.stringify(buildTransferTypedData(requirement, account, options)),
      ],
    })) as string
  } catch (error) {
    return {
      error:
        errorCode(error) === 4001 ? "x402WalletRejected" : "x402PaymentRefused",
    }
  }

  return {
    signature: encodePaymentSignature(
      buildPaymentPayload(
        paymentRequired,
        requirement,
        account,
        signature,
        options
      )
    ),
    requirement,
  }
}
