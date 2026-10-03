// t-cherk-com-hotfix batch 6: the owner's list of transfer requisites (bank
// cards and accounts, crypto wallets). Plain TS with no JSX, so the panel's
// node tests import it as it is. The rules mirror the backend's
// `api/tenants/payment-settings/manual/manual-payment.ts` and its validator:
// the panel says what is wrong under the field, the backend refuses the same
// thing with a 400 if a request gets past the panel.

export const REQUISITES_MAX = 30

export const CRYPTO_CURRENCIES = ["USDT", "USDC"] as const
export const CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "TON", "Solana", "Polygon"] as const

export type CryptoNetwork = (typeof CRYPTO_NETWORKS)[number]

const BASE58 = "[1-9A-HJ-NP-Za-km-z]"

/** By format only, like the backend: a stub with a broken checksum must stay savable. */
export const CRYPTO_ADDRESS_PATTERNS: Record<CryptoNetwork, RegExp> = {
  TRC20: new RegExp(`^T${BASE58}{33}$`),
  ERC20: /^0x[0-9a-fA-F]{40}$/,
  BEP20: /^0x[0-9a-fA-F]{40}$/,
  Polygon: /^0x[0-9a-fA-F]{40}$/,
  TON: /^(?:[A-Za-z0-9_+/-]{48}|-?\d:[0-9a-fA-F]{64})$/,
  Solana: new RegExp(`^${BASE58}{32,44}$`),
}

/** A card number, an account number or an IBAN: letters, digits, spaces and dashes. */
export const BANK_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{2,62}[A-Za-z0-9]$/

export const isKnownNetwork = (network: string): network is CryptoNetwork =>
  (CRYPTO_NETWORKS as readonly string[]).includes(network)

export const isValidBankNumber = (number: string): boolean =>
  BANK_NUMBER_PATTERN.test(number.trim())

export const isValidCryptoAddress = (network: string, address: string): boolean =>
  isKnownNetwork(network) && CRYPTO_ADDRESS_PATTERNS[network].test(address.trim())

/** «•••• 1234»: the list row shows which card it is without the whole number. */
export const maskBankNumber = (number: string): string => {
  const compact = number.replace(/[\s-]/g, "")
  return compact.length > 4 ? `•••• ${compact.slice(-4)}` : compact
}

/** «TXyz12…9aBc»: the start and the end, the parts a person compares. */
export const maskAddress = (address: string): string =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address

/** Two letters for a bank without an icon, the neutral fallback. */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?"

/** Moves an item one place up (-1) or down (+1); out of range leaves the list as it is. */
export const moveItem = <T>(items: T[], index: number, delta: -1 | 1): T[] => {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items
  }
  const next = items.slice()
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
