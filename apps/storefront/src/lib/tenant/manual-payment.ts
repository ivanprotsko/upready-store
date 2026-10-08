/**
 * The shop's offline way to pay on the built-in `pp_system_default` provider
 * (olavka-payments → batch 7, Ivan 03.10: «Все в одном списке»): a transfer to
 * the owner's own bank cards, accounts and crypto wallets, settled by the
 * buyer's receipt and the owner's confirmation. The backend publishes the list
 * per shop (`api/storefront/by-host/route.ts` → `manual_payment`, written by
 * `PUT /tenants/payment-settings/manual`), the middleware carries it on
 * `x-tenant-manual-payment`, and the checkout, the order page and the account
 * read what arrives — the same split `branding.ts` and `attribution.ts` use.
 *
 * Nothing here is a default. A card number, a wallet address or a phone number
 * appears on a page only because the OWNER of that shop typed it into the panel;
 * a shop that configured nothing offers nothing beyond the provider itself and
 * looks exactly as it did before this file existed.
 *
 * Two document shapes are read:
 * - batch 7 and later: `{ enabled, requisites: [bank | crypto…], contacts }`
 *   (plus the two old sections, derived by the backend for a rolled-back reader);
 * - before batch 7: `{ crypto: { enabled, wallets }, manager: { enabled, cards, …contacts } }`,
 *   which is read into the one list on the fly — cards first, then wallets, the
 *   order the checkout used to show them in.
 */

export type ManualPaymentWallet = {
  /** The chain, as the buyer needs to see it next to the address: "TRC20", "ERC20". */
  network: string
  /** The asset: "USDT", "USDC". */
  currency: string
  address: string
}

/** A bank card to transfer to, as the document before batch 7 stored it. */
export type ManualPaymentCard = {
  bank: string
  number: string
  holder: string | null
}

export type ManualPaymentContacts = {
  /** Digits with an optional leading `+`, what `https://wa.me/<number>` takes. */
  whatsapp: string | null
  /** The username without the `@`, what `https://t.me/<username>` takes. */
  telegram: string | null
  email: string | null
  /** The owner's own line under the method, e.g. which transfers they accept. */
  note: string | null
}

/** A bank card or account in the owner's list (batch 7). */
export type BankRequisite = {
  /** Stable within the shop's list: React keys. */
  id: string
  kind: "bank"
  /** A preset key the storefront draws from `/payment-icons/<key>.png`, or null for a bank without one. */
  icon: string | null
  bank: string
  /** A card number, an account number or an IBAN, as the buyer types it into their bank. */
  number: string
  /** The holder's name as the buyer's bank shows it, or null when the owner left it out. */
  holder: string | null
}

/** A crypto wallet in the owner's list (batch 7). */
export type CryptoRequisite = {
  id: string
  kind: "crypto"
  /** The asset's own icon key (`usdt`, `usdc`), or null for another asset. */
  icon: string | null
  /** "USDT", "USDC". */
  currency: string
  /** "TRC20", "ERC20", "BEP20", "TON", "Solana", "Polygon". */
  network: string
  address: string
}

export type PaymentRequisite = BankRequisite | CryptoRequisite

export type TenantManualPayment = {
  /** The method is offered at checkout: on, with something to pay to or someone to ask. */
  enabled: boolean
  /** The owner's list in the owner's order; empty when the method is not offered. */
  requisites: PaymentRequisite[]
  /** The manager contacts for «связаться с менеджером». */
  contacts: ManualPaymentContacts
  /** The two sections of the document before batch 7, derived from the list. */
  crypto: { enabled: boolean; wallets: ManualPaymentWallet[] }
  manager: { enabled: boolean; cards: ManualPaymentCard[] } & ManualPaymentContacts
}

/**
 * The buyer's choice inside the manual provider, stamped on the cart and so on
 * the order. `"requisites"` is the one kind since batch 7 (the bank or wallet is
 * picked on the order page, after «Оформить заказ»); `"crypto"` and `"other"` are
 * what orders placed before it carry.
 */
export type ManualPaymentKind = "crypto" | "other" | "requisites"

/** Where the checkout writes the chosen kind: `cart.metadata`, copied onto `order.metadata` at completion. */
export const MANUAL_PAYMENT_KIND_METADATA_KEY = "manual_payment_kind"

const EMPTY_CONTACTS: ManualPaymentContacts = {
  whatsapp: null,
  telegram: null,
  email: null,
  note: null,
}

/** A shop that configured nothing: the checkout then renders exactly as it does today. */
export const EMPTY_MANUAL_PAYMENT: TenantManualPayment = {
  enabled: false,
  requisites: [],
  contacts: EMPTY_CONTACTS,
  crypto: { enabled: false, wallets: [] },
  manager: { enabled: false, cards: [], ...EMPTY_CONTACTS },
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

export const hasManagerContact = (contacts: ManualPaymentContacts): boolean =>
  Boolean(contacts.whatsapp || contacts.telegram || contacts.email)

/**
 * Where a «write to the shop» control opens a conversation: the first contact the owner
 * entered, in the order `ManagerContactCTA`'s single button takes them (WhatsApp, then
 * Telegram, then e-mail), with no prefilled text. Null when there is none: the control is
 * then not drawn at all, rather than drawn and leading nowhere.
 */
export const managerChatHref = (contacts: ManualPaymentContacts): string | null => {
  if (contacts.whatsapp) {
    return `https://wa.me/${contacts.whatsapp.replace(/^\+/, "")}`
  }
  if (contacts.telegram) {
    return `https://t.me/${contacts.telegram}`
  }
  if (contacts.email) {
    return `mailto:${contacts.email}`
  }
  return null
}

/** The icon key of a crypto asset the storefront ships a mark for (`public/payment/<key>.svg`), or null. */
export const cryptoIconFor = (currency: string): string | null => {
  const key = currency.trim().toLowerCase()
  return key === "usdt" || key === "usdc" ? key : null
}

/**
 * Where the icon of a requisite is served from: the storefront's own marks for
 * USDT and USDC, the preset PNGs the panel offers for banks
 * (`public/payment-icons/<key>.png`, t-cherk-com-hotfix batch 6). Null means
 * «draw the fallback» — the bank's initials.
 */
export const requisiteIconSrc = (item: PaymentRequisite): string | null => {
  if (!item.icon) {
    return null
  }
  if (item.kind === "crypto") {
    return `/payment/${item.icon}.svg`
  }
  return `/payment-icons/${item.icon}.png`
}

const readContacts = (raw: unknown): ManualPaymentContacts => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    whatsapp: str(source.whatsapp),
    telegram: str(source.telegram),
    email: str(source.email),
    note: str(source.note),
  }
}

const readWallets = (raw: unknown): ManualPaymentWallet[] => {
  if (!Array.isArray(raw)) {
    return []
  }

  const wallets: ManualPaymentWallet[] = []

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue
    }
    const wallet = item as Partial<ManualPaymentWallet>
    const network = str(wallet.network)
    const currency = str(wallet.currency)
    const address = str(wallet.address)
    if (network && currency && address) {
      wallets.push({ network, currency: currency.toUpperCase(), address })
    }
  }

  return wallets
}

const readCards = (raw: unknown): ManualPaymentCard[] => {
  if (!Array.isArray(raw)) {
    return []
  }

  const cards: ManualPaymentCard[] = []

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue
    }
    const card = item as Partial<ManualPaymentCard>
    const bank = str(card.bank)
    const number = str(card.number)
    if (bank && number) {
      cards.push({ bank, number, holder: str(card.holder) })
    }
  }

  return cards
}

/** A list item as published; a malformed one (no number, no address) is dropped, never thrown on. */
const readRequisite = (raw: unknown, index: number): PaymentRequisite | null => {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const item = raw as Record<string, unknown>
  const id = str(item.id) ?? `item-${index}`

  if (item.kind === "bank") {
    const bank = str(item.bank)
    const number = str(item.number)
    if (!bank || !number) {
      return null
    }
    return { id, kind: "bank", icon: str(item.icon), bank, number, holder: str(item.holder) }
  }

  if (item.kind === "crypto") {
    const currency = str(item.currency)
    const network = str(item.network)
    const address = str(item.address)
    if (!currency || !network || !address) {
      return null
    }
    const upper = currency.toUpperCase()
    return {
      id,
      kind: "crypto",
      icon: str(item.icon) ?? cryptoIconFor(upper),
      currency: upper,
      network,
      address,
    }
  }

  return null
}

/** Ids are the list's keys: a duplicate gets its position appended. */
const withUniqueIds = (items: PaymentRequisite[]): PaymentRequisite[] => {
  const seen: Record<string, true> = {}
  return items.map((item, index) => {
    const id = seen[item.id] ? `${item.id}-${index}` : item.id
    seen[id] = true
    return id === item.id ? item : { ...item, id }
  })
}

/** The two old sections, derived from the list: what every reader from before batch 7 still takes. */
const legacySections = (
  enabled: boolean,
  requisites: PaymentRequisite[],
  contacts: ManualPaymentContacts
): Pick<TenantManualPayment, "crypto" | "manager"> => {
  const wallets: ManualPaymentWallet[] = []
  const cards: ManualPaymentCard[] = []
  for (const item of requisites) {
    if (item.kind === "crypto") {
      wallets.push({ network: item.network, currency: item.currency, address: item.address })
    } else {
      cards.push({ bank: item.bank, number: item.number, holder: item.holder })
    }
  }
  return {
    crypto: { enabled: enabled && wallets.length > 0, wallets },
    manager: {
      enabled: enabled && (cards.length > 0 || hasManagerContact(contacts)),
      cards,
      ...contacts,
    },
  }
}

/** The document from before batch 7: manager cards, then crypto wallets, into the one list. */
const readLegacy = (doc: Record<string, unknown>): TenantManualPayment => {
  const crypto = doc.crypto && typeof doc.crypto === "object" ? (doc.crypto as Record<string, unknown>) : null
  const manager = doc.manager && typeof doc.manager === "object" ? (doc.manager as Record<string, unknown>) : null

  const wallets = crypto?.enabled ? readWallets(crypto.wallets) : []
  const cards = manager?.enabled ? readCards(manager.cards) : []
  const contacts = manager?.enabled ? readContacts(manager) : EMPTY_CONTACTS

  const requisites: PaymentRequisite[] = []
  cards.forEach((card, index) => {
    requisites.push({ id: `card-${index}`, kind: "bank", icon: null, ...card })
  })
  wallets.forEach((wallet, index) => {
    requisites.push({
      id: `wallet-${index}`,
      kind: "crypto",
      icon: cryptoIconFor(wallet.currency),
      ...wallet,
    })
  })

  const enabled = requisites.length > 0 || (Boolean(manager?.enabled) && hasManagerContact(contacts))

  return {
    enabled,
    requisites,
    contacts,
    ...legacySections(enabled, requisites, contacts),
  }
}

/**
 * From whatever the backend answered (or the header carried). A list with
 * nothing in it and nobody to ask is «not offered», and a malformed or
 * half-filled document degrades to the same, never to a throw inside the
 * checkout.
 */
export const readManualPayment = (raw: unknown): TenantManualPayment => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_MANUAL_PAYMENT
  }

  const doc = raw as Record<string, unknown>

  if (!Array.isArray(doc.requisites)) {
    return readLegacy(doc)
  }

  const requisites = withUniqueIds(
    doc.requisites
      .map((item, index) => readRequisite(item, index))
      .filter((item): item is PaymentRequisite => item !== null)
  )
  // The public view carries the contacts twice: `contacts` (null when not offered)
  // and the derived `manager` section. Either one is the owner's contacts.
  const contacts = readContacts(doc.contacts ?? doc.manager)
  const enabled =
    doc.enabled !== false && (requisites.length > 0 || hasManagerContact(contacts))

  return {
    enabled,
    requisites: enabled ? requisites : [],
    contacts: enabled ? contacts : EMPTY_CONTACTS,
    ...legacySections(enabled, requisites, contacts),
  }
}

/**
 * The kinds the checkout may offer inside the manual provider, in display order.
 * Since batch 7 there is one: «Перевод по реквизитам», whenever the owner
 * entered a requisite or a contact. Empty keeps the provider's demo card.
 */
export const availableManualPaymentKinds = (
  manual: TenantManualPayment
): ManualPaymentKind[] => (manual.enabled ? ["requisites"] : [])

/** From the request header the middleware wrote. Malformed JSON is not a 500 — the
 * shop still renders with no offline method, the posture `parseBrandingHeader` takes. */
export const parseManualPaymentHeader = (
  raw: string | null | undefined
): TenantManualPayment | null => {
  if (!raw) {
    return null
  }

  try {
    return readManualPayment(JSON.parse(raw))
  } catch {
    return null
  }
}

/** The kind an order was placed with, or null for a manual order that predates the split (the demo card). */
export const readManualPaymentKind = (
  metadata: Record<string, unknown> | null | undefined
): ManualPaymentKind | null => {
  const value = metadata?.[MANUAL_PAYMENT_KIND_METADATA_KEY]
  return value === "crypto" || value === "other" || value === "requisites" ? value : null
}
