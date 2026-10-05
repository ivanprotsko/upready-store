import type { PutX402Body, X402Settings } from "../hooks/api/x402"

/**
 * The x402 card's form logic (t-2026-10-03-33), plain TS with no JSX so
 * `src/__tests__/x402-settings.test.mjs` runs it for real.
 *
 * The checks mirror the backend's, so the owner reads the reason next to the
 * field instead of after a round trip. The backend stays the authority: it
 * also checks the EIP-55 checksum of a mixed-case address, which the panel
 * does not, and it refuses a network the instance does not offer.
 */

export type X402Draft = {
  enabled: boolean
  pay_to: string
  /** CAIP-2 ids of the ticked networks. */
  networks: string[]
  facilitator_url: string
}

export type X402Field = "pay_to" | "networks" | "facilitator_url"

export const EMPTY_X402_DRAFT: X402Draft = {
  enabled: false,
  pay_to: "",
  networks: [],
  facilitator_url: "",
}

/** The form as the stored row fills it; with no row, the facilitator starts at the instance's default. */
export const x402DraftFrom = (
  settings: X402Settings | null | undefined,
  defaultFacilitatorUrl: string
): X402Draft =>
  settings
    ? {
        enabled: settings.is_enabled,
        pay_to: settings.pay_to,
        networks: [...settings.networks],
        facilitator_url: settings.facilitator_url,
      }
    : { ...EMPTY_X402_DRAFT, facilitator_url: defaultFacilitatorUrl }

/** Format only: 0x and 40 hex digits. */
export const isValidEvmAddress = (raw: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(raw.trim())

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i

export const isValidFacilitatorUrl = (raw: string): boolean => {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash) {
    return false
  }
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname))
}

/**
 * Field → translation key of what is wrong with it. Switching x402 on needs an
 * address and at least one network.
 */
export const x402DraftErrors = (draft: X402Draft): Partial<Record<X402Field, string>> => {
  const errors: Partial<Record<X402Field, string>> = {}
  const payTo = draft.pay_to.trim()
  const facilitatorUrl = draft.facilitator_url.trim()

  if (payTo && !isValidEvmAddress(payTo)) {
    errors.pay_to = "x402.errors.payTo"
  }
  if (facilitatorUrl && !isValidFacilitatorUrl(facilitatorUrl)) {
    errors.facilitator_url = "x402.errors.facilitatorUrl"
  }
  if (draft.enabled) {
    if (!payTo && !errors.pay_to) {
      errors.pay_to = "x402.errors.required"
    }
    if (draft.networks.length === 0) {
      errors.networks = "x402.errors.networks"
    }
  }
  return errors
}

/** The PUT body: trimmed, networks and the switch always sent, an empty address or facilitator left out. */
export const x402Payload = (draft: X402Draft): PutX402Body => {
  const body: PutX402Body = { is_enabled: draft.enabled, networks: [...draft.networks] }
  const payTo = draft.pay_to.trim()
  const facilitatorUrl = draft.facilitator_url.trim()
  if (payTo) {
    body.pay_to = payTo
  }
  if (facilitatorUrl) {
    body.facilitator_url = facilitatorUrl
  }
  return body
}

/**
 * What an x402 payment keeps in `payment.data` once it settled, for the order's
 * payment section.
 */
export type X402Payment = {
  transaction: string
  /** Only an https:// link; anything else is dropped. */
  explorerUrl: string | null
  network: string | null
  testnet: boolean
}

/** Names of the CAIP-2 ids the backend's x402 catalog knows (`apps/backend/src/x402/networks.ts`); any other id shows as is. */
const X402_NETWORK_LABELS: Record<string, string> = {
  "eip155:84532": "Base Sepolia",
  "eip155:8453": "Base",
}

export const readX402Payment = (data: Record<string, unknown> | null | undefined): X402Payment | null => {
  if (!data || typeof data.transaction !== "string" || !data.transaction) {
    return null
  }
  return {
    transaction: data.transaction,
    explorerUrl:
      typeof data.explorer_url === "string" && data.explorer_url.startsWith("https://") ? data.explorer_url : null,
    network:
      typeof data.network === "string" && data.network ? X402_NETWORK_LABELS[data.network] ?? data.network : null,
    testnet: data.testnet === true,
  }
}

/** `0x1234abcd…9f8e7d6c`: the first 10 and the last 8 characters. */
export const shortHash = (hash: string): string =>
  hash.length <= 10 + 8 + 1 ? hash : `${hash.slice(0, 10)}…${hash.slice(-8)}`
