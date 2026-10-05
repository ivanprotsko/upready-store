import { describe, expect, it } from "vitest"
import {
  addChainParams,
  buildPaymentPayload,
  buildTransferTypedData,
  chainIdOf,
  encodePaymentSignature,
  isTestNetwork,
  isX402,
  payWithWallet,
  pickRequirement,
  randomNonce,
  x402SessionOf,
  type X402PaymentRequired,
  type X402Requirement,
} from "./x402"

const NONCE = "0x" + "ab".repeat(32)
const NOW = 1_800_000_000

const sepolia: X402Requirement = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "25500000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 300,
  extra: { name: "USDC", version: "2" },
}
const base: X402Requirement = {
  ...sepolia,
  network: "eip155:8453",
  extra: { name: "USD Coin", version: "2" },
}
const required: X402PaymentRequired = {
  x402Version: 2,
  resource: { url: "https://shop.example/pay", description: "Заказ №1 ✓" },
  accepts: [sepolia, base],
}
const FROM = "0x2222222222222222222222222222222222222222"

type Call = { method: string; params?: unknown[] }
const fakeWallet = (
  handlers: Record<string, (params?: unknown[]) => unknown>,
  calls: Call[] = []
) => ({
  calls,
  request: async ({ method, params }: Call) => {
    calls.push({ method, params })
    const handler = handlers[method]
    if (!handler) throw new Error("unexpected " + method)
    return handler(params)
  },
})

describe("helpers", () => {
  it("knows the provider and finds its session", () => {
    expect(isX402("pp_x402_x402")).toBe(true)
    expect(isX402("pp_btcpay_btcpay")).toBe(false)
    const cart = {
      payment_collection: {
        payment_sessions: [
          { provider_id: "pp_btcpay_btcpay", data: {} },
          { provider_id: "pp_x402_x402", data: { settled_at: "now" } },
        ],
      },
    }
    expect(x402SessionOf(cart)?.data.settled_at).toBe("now")
    expect(x402SessionOf({ payment_collection: null })).toBeNull()
  })

  it("reads chain ids and test networks", () => {
    expect(chainIdOf("eip155:8453")).toBe(8453)
    expect(chainIdOf("solana:1")).toBeNull()
    expect(isTestNetwork("eip155:84532")).toBe(true)
    expect(isTestNetwork("eip155:8453")).toBe(false)
  })

  it("picks the entry on the wallet's chain, else the first", () => {
    expect(pickRequirement([sepolia, base], "0x2105")).toBe(base)
    expect(pickRequirement([sepolia, base], 8453)).toBe(base)
    expect(pickRequirement([sepolia, base], "0x1")).toBe(sepolia)
    expect(pickRequirement([], 1)).toBeNull()
  })

  it("makes 32-byte hex nonces", () => {
    expect(randomNonce()).toMatch(/^0x[0-9a-f]{64}$/)
    expect(randomNonce()).not.toBe(randomNonce())
  })

  it("knows the params of both Base networks", () => {
    expect(addChainParams(84532)?.chainId).toBe("0x14a34")
    expect(addChainParams(8453)?.rpcUrls).toEqual(["https://mainnet.base.org"])
    expect(addChainParams(1)).toBeNull()
  })
})

describe("typed data and payload", () => {
  it("has the exact EIP-3009 shape", () => {
    const data = buildTransferTypedData(sepolia, FROM, {
      nowSeconds: NOW,
      nonce: NONCE,
    })
    expect(data.primaryType).toBe("TransferWithAuthorization")
    expect(data.types.TransferWithAuthorization.map((f) => f.name)).toEqual([
      "from",
      "to",
      "value",
      "validAfter",
      "validBefore",
      "nonce",
    ])
    expect(data.domain).toEqual({
      name: "USDC",
      version: "2",
      chainId: 84532,
      verifyingContract: sepolia.asset,
    })
    expect(data.message).toEqual({
      from: FROM,
      to: sepolia.payTo,
      value: "25500000",
      validAfter: String(NOW - 600),
      validBefore: String(NOW + 300),
      nonce: NONCE,
    })
  })

  it("echoes accepted unchanged and round-trips through base64", () => {
    const payload = buildPaymentPayload(required, sepolia, FROM, "0xsig", {
      nowSeconds: NOW,
      nonce: NONCE,
    })
    expect(payload.accepted).toBe(sepolia)
    expect(payload.x402Version).toBe(2)
    expect(payload.resource).toBe(required.resource)
    expect(payload.payload.authorization.to).toBe(sepolia.payTo)
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(encodePaymentSignature(payload)), (c) =>
          c.charCodeAt(0)
        )
      )
    )
    expect(decoded).toEqual(JSON.parse(JSON.stringify(payload)))
    expect(decoded.resource.description).toBe("Заказ №1 ✓")
  })
})

describe("payWithWallet", () => {
  const happy = {
    eth_requestAccounts: () => [FROM],
    eth_signTypedData_v4: () => "0xsig",
  }

  it("answers x402WalletMissing without a wallet", async () => {
    expect(await payWithWallet(undefined, required)).toEqual({
      error: "x402WalletMissing",
    })
  })

  it("signs on the wallet's own chain without switching", async () => {
    const wallet = fakeWallet({ ...happy, eth_chainId: () => "0x2105" })
    const result = await payWithWallet(wallet, required, {
      nowSeconds: NOW,
      nonce: NONCE,
    })
    expect("signature" in result && result.requirement).toBe(base)
    expect(wallet.calls.map((c) => c.method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "eth_signTypedData_v4",
    ])
    const [from, json] = wallet.calls[2].params as [string, string]
    expect(from).toBe(FROM)
    expect(JSON.parse(json).domain.chainId).toBe(8453)
    if ("signature" in result) {
      const payload = JSON.parse(atob(result.signature))
      expect(payload.accepted).toEqual(base)
      expect(payload.payload.signature).toBe("0xsig")
    }
  })

  it("switches to the first entry when the wallet is elsewhere", async () => {
    const wallet = fakeWallet({
      ...happy,
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => null,
    })
    await payWithWallet(wallet, required)
    expect(wallet.calls[2]).toEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14a34" }],
    })
  })

  it("adds the chain on 4902 and switches again", async () => {
    let switches = 0
    const wallet = fakeWallet({
      ...happy,
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        if (switches++ === 0)
          throw Object.assign(new Error("unknown"), { code: 4902 })
        return null
      },
      wallet_addEthereumChain: () => null,
    })
    const result = await payWithWallet(wallet, required)
    expect("signature" in result).toBe(true)
    expect(wallet.calls.map((c) => c.method).slice(2, 5)).toEqual([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ])
    expect(
      (wallet.calls[3].params as { chainName: string }[])[0].chainName
    ).toBe("Base Sepolia")
  })

  it("answers x402NetworkFailed when the switch fails", async () => {
    const wallet = fakeWallet({
      ...happy,
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw Object.assign(new Error("boom"), { code: -32603 })
      },
    })
    expect(await payWithWallet(wallet, required)).toEqual({
      error: "x402NetworkFailed",
    })
  })

  it("answers x402WalletRejected on code 4001", async () => {
    const reject = () => {
      throw Object.assign(new Error("denied"), { code: 4001 })
    }
    expect(
      await payWithWallet(fakeWallet({ eth_requestAccounts: reject }), required)
    ).toEqual({
      error: "x402WalletRejected",
    })
    const signing = fakeWallet({
      ...happy,
      eth_chainId: () => "0x14a34",
      eth_signTypedData_v4: reject,
    })
    expect(await payWithWallet(signing, required)).toEqual({
      error: "x402WalletRejected",
    })
  })

  it("answers x402PaymentRefused when signing fails otherwise", async () => {
    const wallet = fakeWallet({
      ...happy,
      eth_chainId: () => "0x14a34",
      eth_signTypedData_v4: () => {
        throw new Error("nope")
      },
    })
    expect(await payWithWallet(wallet, required)).toEqual({
      error: "x402PaymentRefused",
    })
  })
})
