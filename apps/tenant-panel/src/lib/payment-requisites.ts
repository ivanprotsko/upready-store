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

// ── t-2026-10-14-01 (panel redesign, G3, line us-8) ─────────────────────────
// The transfer card reads; each requisite, the switch and the contacts are
// edited in their own drawer, and each drawer sends only what it names (the
// backend keeps the rest, `PUT` with optional keys). The drafts, the checks
// and the bodies live here so the node tests run them as they are. A check
// answers with ru.json keys; the drawer says them under the field.

type BankItem = {
  id?: string
  kind: "bank"
  icon: string | null
  bank: string
  number: string
  holder: string | null
}

type CryptoItem = {
  id?: string
  kind: "crypto"
  currency: string
  network: string
  address: string
}

type Item = BankItem | CryptoItem

type Contacts = {
  whatsapp: string | null
  telegram: string | null
  email: string | null
  note: string | null
}

/** The «Выберите банк» value of a bank without a preset: the name is typed by hand. */
export const OTHER_BANK = "other"

export type BankDraft = { icon: string; bank: string; number: string; holder: string }
export type CryptoDraft = { currency: string; network: string; address: string }
export type ContactsDraft = { whatsapp: string; telegram: string; email: string; note: string }

export type DraftErrors<T> = Partial<Record<keyof T, string>>

/** A new bank starts with nothing picked; a stored one with its preset, or «Другой банк». */
export const bankDraftFrom = (item?: BankItem): BankDraft => ({
  icon: item ? (item.icon ?? OTHER_BANK) : "",
  bank: item?.bank ?? "",
  number: item?.number ?? "",
  holder: item?.holder ?? "",
})

export const cryptoDraftFrom = (item?: CryptoItem): CryptoDraft => ({
  currency: item?.currency ?? CRYPTO_CURRENCIES[0],
  network: item?.network ?? "TRC20",
  address: item?.address ?? "",
})

export const bankDraftErrors = (draft: BankDraft): DraftErrors<BankDraft> => {
  const errors: DraftErrors<BankDraft> = {}
  if (!draft.icon) {
    errors.icon = "manualPayment.errors.pickBank"
  }
  if (!draft.bank.trim()) {
    errors.bank = "manualPayment.errors.bankName"
  }
  if (!isValidBankNumber(draft.number)) {
    errors.number = "manualPayment.errors.bankNumber"
  }
  return errors
}

export const cryptoDraftErrors = (draft: CryptoDraft): DraftErrors<CryptoDraft> => {
  if (!isKnownNetwork(draft.network)) {
    return { network: "manualPayment.errors.network" }
  }
  return isValidCryptoAddress(draft.network, draft.address)
    ? {}
    : { address: "manualPayment.errors.address" }
}

export const bankRequisite = (draft: BankDraft, id?: string): BankItem => ({
  id,
  kind: "bank",
  icon: draft.icon === OTHER_BANK ? null : draft.icon,
  bank: draft.bank.trim(),
  number: draft.number.trim(),
  holder: draft.holder.trim() || null,
})

export const cryptoRequisite = (draft: CryptoDraft, id?: string): CryptoItem => ({
  id,
  kind: "crypto",
  currency: draft.currency,
  network: draft.network,
  address: draft.address.trim(),
})

/** The list with the item in place of the one with its id, or the item last when it is new. */
export const putRequisite = <T extends Item>(items: T[], item: T): T[] =>
  item.id && items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item]

export const contactsDraftFrom = (contacts?: Contacts): ContactsDraft => ({
  whatsapp: contacts?.whatsapp ?? "",
  telegram: contacts?.telegram ?? "",
  email: contacts?.email ?? "",
  note: contacts?.note ?? "",
})

/** «+7 999 123-45-67» → «+79991234567»: the number `wa.me` takes, as the backend wants it. */
export const compactPhone = (value: string): string => value.trim().replace(/[\s()-]/g, "")

/** «@shop», «https://t.me/shop» → «shop». */
export const telegramUsername = (value: string): string =>
  value.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "")

/** The backend's own patterns (`PutTenantManualPaymentSchema`), checked before the request. */
export const contactsDraftErrors = (draft: ContactsDraft): DraftErrors<ContactsDraft> => {
  const errors: DraftErrors<ContactsDraft> = {}
  const whatsapp = compactPhone(draft.whatsapp)
  const telegram = telegramUsername(draft.telegram)
  const email = draft.email.trim()
  if (whatsapp && !/^\+?\d{7,15}$/.test(whatsapp)) {
    errors.whatsapp = "paymentMethods.manual.errors.whatsapp"
  }
  if (telegram && !/^[A-Za-z0-9_]{4,32}$/.test(telegram)) {
    errors.telegram = "paymentMethods.manual.errors.telegram"
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "paymentMethods.manual.errors.email"
  }
  return errors
}

export const contactsPayload = (draft: ContactsDraft): Contacts => ({
  whatsapp: compactPhone(draft.whatsapp) || null,
  telegram: telegramUsername(draft.telegram) || null,
  email: draft.email.trim() || null,
  note: draft.note.trim() || null,
})

export const hasContact = (contacts: Contacts): boolean =>
  Boolean(contacts.whatsapp || contacts.telegram || contacts.email)

/**
 * The backend refuses transfers switched on with nothing to offer: no
 * requisite and no manager contact. The panel asks the same before a request.
 */
export const offersNothing = (state: { enabled: boolean; requisites: unknown[]; contacts: Contacts }) =>
  state.enabled && state.requisites.length === 0 && !hasContact(state.contacts)
