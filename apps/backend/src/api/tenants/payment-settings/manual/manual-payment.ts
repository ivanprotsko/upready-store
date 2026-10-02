import { bankIconFor, BANK_ICON_KEYS, cryptoIconFor } from "./presets";

/**
 * The shop's OFFLINE way to pay (olavka-payments): a transfer to the owner's
 * own bank cards, accounts and crypto wallets, settled by the buyer's receipt
 * and the owner's confirmation. It runs on Medusa's built-in
 * `pp_system_default` provider, so there is no payment module behind it and
 * nothing is captured automatically: the order stays «awaiting payment» until
 * the owner captures it in the panel (`api/tenants/payments/[id]/capture`).
 *
 * Lives in `tenant.metadata.manual_payment`, the same convention `branding`,
 * `analytics` and `seo_verification` use (one JSON document per concern, merged
 * on every write so a route never clobbers a sibling key).
 *
 * t-cherk-com-hotfix batch 6 (Ivan 03.10: «Все в одном списке, редактирует
 * через админку»): ONE ordered list of requisites, a bank item or a crypto
 * item each, one switch for the whole method, and the manager contacts for
 * «связаться с менеджером». The document before it kept two sections,
 * `crypto { enabled, wallets }` and `manager { enabled, cards ≤5, contacts }`;
 * such a document is read into the list on the fly (cards first, then
 * wallets, the order the checkout showed them in), and every write stores the
 * list together with those two sections derived from it, so a backend rolled
 * back to the old reader still finds its data.
 *
 * Every number, address and contact is the OWNER's data. Nothing here carries
 * a default: a shop that configured nothing offers nothing.
 */

export const REQUISITES_MAX = 30;
export const CRYPTO_CURRENCIES = ["USDT", "USDC"] as const;
export const CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "TON", "Solana", "Polygon"] as const;

export type BankRequisite = {
  /** Stable within the shop's list: React keys, reordering. */
  id: string;
  kind: "bank";
  /** A bank preset key (`presets.ts`), or null for a bank without an icon. */
  icon: string | null;
  bank: string;
  /** A card number, an account number or an IBAN, as the buyer types it into their bank. */
  number: string;
  /** The holder's name as the buyer's bank shows it on a transfer, or null when the owner leaves it out. */
  holder: string | null;
};

export type CryptoRequisite = {
  id: string;
  kind: "crypto";
  /** "USDT" or "USDC" for anything written since batch 6; an older wallet keeps what it had. */
  currency: string;
  /** One of `CRYPTO_NETWORKS` for anything written since batch 6. */
  network: string;
  address: string;
};

export type PaymentRequisite = BankRequisite | CryptoRequisite;

export type ManualPaymentContacts = {
  /** Digits only, with an optional leading `+`: what `https://wa.me/<number>` takes. */
  whatsapp: string | null;
  /** The username without the `@`: what `https://t.me/<username>` takes. */
  telegram: string | null;
  email: string | null;
  /** Free text the checkout shows under the method, e.g. which transfers the owner accepts. */
  note: string | null;
};

export type TenantManualPayment = {
  /** The whole method, on or off. */
  enabled: boolean;
  requisites: PaymentRequisite[];
  contacts: ManualPaymentContacts;
};

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

/**
 * What an address looks like on each network, by FORMAT only. No checksum is
 * checked on purpose: the stub requisites a shop is seeded with
 * (`scripts/seed-stub-requisites.ts`) carry deliberately broken checksums so
 * nobody can pay to them, and the owner must still be able to save a list
 * that holds them.
 */
export const CRYPTO_ADDRESS_FORMATS: Record<(typeof CRYPTO_NETWORKS)[number], { pattern: RegExp; hint: string }> = {
  TRC20: { pattern: new RegExp(`^T${BASE58}{33}$`), hint: "a TRON address: 34 characters starting with T" },
  ERC20: { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "an Ethereum address: 0x and 40 hex characters" },
  BEP20: { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "a BNB Smart Chain address: 0x and 40 hex characters" },
  Polygon: { pattern: /^0x[0-9a-fA-F]{40}$/, hint: "a Polygon address: 0x and 40 hex characters" },
  TON: {
    pattern: /^(?:[A-Za-z0-9_+/-]{48}|-?\d:[0-9a-fA-F]{64})$/,
    hint: "a TON address: 48 characters (EQ…, UQ…) or 0:<64 hex>",
  },
  Solana: { pattern: new RegExp(`^${BASE58}{32,44}$`), hint: "a Solana address: 32 to 44 base58 characters" },
};

/** A card number, an account number or an IBAN: letters, digits, spaces and dashes. */
export const BANK_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{2,62}[A-Za-z0-9]$/;

const EMPTY_CONTACTS: ManualPaymentContacts = { whatsapp: null, telegram: null, email: null, note: null };

export const EMPTY_MANUAL_PAYMENT: TenantManualPayment = {
  enabled: false,
  requisites: [],
  contacts: EMPTY_CONTACTS,
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** "TRC-20", "trc20", "Trc 20" → "TRC20"; a network outside the list keeps what was typed. */
export const normalizeNetwork = (network: string): string => {
  const compact = network.replace(/[\s-]/g, "").toLowerCase();
  return CRYPTO_NETWORKS.find((known) => known.toLowerCase() === compact) ?? network.trim();
};

const readContacts = (raw: unknown): ManualPaymentContacts => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    whatsapp: str(source.whatsapp),
    telegram: str(source.telegram),
    email: str(source.email),
    note: str(source.note),
  };
};

/** A list item as stored; a malformed one (no number, no address) is dropped, never thrown on. */
const readRequisite = (raw: unknown, index: number): PaymentRequisite | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const id = str(item.id) ?? `item-${index}`;

  if (item.kind === "bank") {
    const bank = str(item.bank);
    const number = str(item.number);
    if (!bank || !number) {
      return null;
    }
    const icon = str(item.icon);
    return {
      id,
      kind: "bank",
      icon: icon && BANK_ICON_KEYS.includes(icon) ? icon : null,
      bank,
      number,
      holder: str(item.holder),
    };
  }

  if (item.kind === "crypto") {
    const currency = str(item.currency);
    const network = str(item.network);
    const address = str(item.address);
    if (!currency || !network || !address) {
      return null;
    }
    return { id, kind: "crypto", currency: currency.toUpperCase(), network: normalizeNetwork(network), address };
  }

  return null;
};

/** Ids are the list's keys: a duplicate (a hand-edited row) gets its position appended. */
const withUniqueIds = (items: PaymentRequisite[]): PaymentRequisite[] => {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const id = seen.has(item.id) ? `${item.id}-${index}` : item.id;
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
};

/** The document from before batch 6: manager cards, then crypto wallets, into the one list. */
const readLegacy = (raw: Record<string, unknown>): TenantManualPayment => {
  const crypto = raw.crypto && typeof raw.crypto === "object" ? (raw.crypto as Record<string, unknown>) : null;
  const manager = raw.manager && typeof raw.manager === "object" ? (raw.manager as Record<string, unknown>) : null;

  const requisites: PaymentRequisite[] = [];

  const cards: unknown[] = manager && Array.isArray(manager.cards) ? manager.cards : [];
  const wallets: unknown[] = crypto && Array.isArray(crypto.wallets) ? crypto.wallets : [];

  for (const card of cards) {
    const value = card && typeof card === "object" ? (card as Record<string, unknown>) : {};
    const bank = str(value.bank);
    const number = str(value.number);
    if (bank && number) {
      requisites.push({
        id: `card-${requisites.length}`,
        kind: "bank",
        icon: bankIconFor(bank),
        bank,
        number,
        holder: str(value.holder),
      });
    }
  }

  for (const wallet of wallets) {
    const value = wallet && typeof wallet === "object" ? (wallet as Record<string, unknown>) : {};
    const network = str(value.network);
    const currency = str(value.currency);
    const address = str(value.address);
    if (network && currency && address) {
      requisites.push({
        id: `wallet-${requisites.length}`,
        kind: "crypto",
        currency: currency.toUpperCase(),
        network: normalizeNetwork(network),
        address,
      });
    }
  }

  return {
    enabled: Boolean(crypto?.enabled) || Boolean(manager?.enabled),
    requisites: requisites.slice(0, REQUISITES_MAX),
    contacts: readContacts(manager),
  };
};

/**
 * `tenant.metadata.manual_payment` as stored, defensively read: a value nobody
 * expects (an old row, a manual edit) is dropped in favour of the safe default
 * rather than thrown on, because a shop with a malformed field must still
 * render its checkout (the posture `readBranding` takes).
 */
export const readManualPayment = (
  metadata: Record<string, unknown> | null | undefined,
): TenantManualPayment => {
  const raw = metadata?.manual_payment;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_MANUAL_PAYMENT;
  }

  const doc = raw as Record<string, unknown>;

  if (!Array.isArray(doc.requisites)) {
    return readLegacy(doc);
  }

  const requisites = doc.requisites
    .map((item, index) => readRequisite(item, index))
    .filter((item): item is PaymentRequisite => item !== null)
    .slice(0, REQUISITES_MAX);

  return {
    enabled: Boolean(doc.enabled),
    requisites: withUniqueIds(requisites),
    contacts: readContacts(doc.contacts),
  };
};

export const hasManagerContact = (contacts: ManualPaymentContacts): boolean =>
  Boolean(contacts.whatsapp || contacts.telegram || contacts.email);

/** The wallet and card shapes of the document from before batch 6. */
export type ManualPaymentWallet = { network: string; currency: string; address: string };
export type ManualPaymentCard = { bank: string; number: string; holder: string | null };

/**
 * The two sections of the document from before batch 6, derived from the
 * list: what an old storefront and `manualPaymentMethods` read. Crypto is on
 * when the method is on and the list holds a wallet; «card via manager» is on
 * when the method is on and the list holds a bank item or a contact.
 */
export type LegacyManualPayment = {
  crypto: { enabled: boolean; wallets: ManualPaymentWallet[] };
  manager: { enabled: boolean; cards: ManualPaymentCard[] } & ManualPaymentContacts;
};

export const legacyManualPayment = (manual: TenantManualPayment): LegacyManualPayment => {
  const wallets = manual.requisites
    .filter((item): item is CryptoRequisite => item.kind === "crypto")
    .map(({ network, currency, address }) => ({ network, currency, address }));
  const cards = manual.requisites
    .filter((item): item is BankRequisite => item.kind === "bank")
    .map(({ bank, number, holder }) => ({ bank, number, holder }));

  return {
    crypto: { enabled: manual.enabled && wallets.length > 0, wallets },
    manager: {
      enabled: manual.enabled && (cards.length > 0 || hasManagerContact(manual.contacts)),
      cards,
      ...manual.contacts,
    },
  };
};

/** What a write stores: the list, plus the two old sections derived from it for a rolled-back reader. */
export const storedManualPayment = (manual: TenantManualPayment): Record<string, unknown> => ({
  version: 2,
  enabled: manual.enabled,
  requisites: manual.requisites,
  contacts: manual.contacts,
  ...legacyManualPayment(manual),
});

/** A crypto item as published: its icon is its asset's own (`usdt`, `usdc`). */
export type PublicCryptoRequisite = CryptoRequisite & { icon: string | null };
export type PublicRequisite = BankRequisite | PublicCryptoRequisite;

/**
 * What `GET /storefront/by-host` publishes as `manual_payment`.
 *
 * - `enabled`: the method is offered at checkout (on, and something to pay to
 *   or someone to ask).
 * - `requisites`: the owner's list in the owner's order; empty when not
 *   offered.
 * - `contacts`: the manager contacts for «связаться с менеджером»; null when
 *   not offered.
 * - `crypto`, `manager`: the two sections from before batch 6, derived, for a
 *   storefront that still reads them. A section that is off carries nothing.
 */
export type ManualPaymentPublicView = {
  enabled: boolean;
  requisites: PublicRequisite[];
  contacts: ManualPaymentContacts | null;
  crypto: { enabled: true; wallets: ManualPaymentWallet[] } | { enabled: false };
  manager:
    | ({ enabled: true; cards: ManualPaymentCard[] } & ManualPaymentContacts)
    | { enabled: false };
};

export const manualPaymentPublicView = (manual: TenantManualPayment): ManualPaymentPublicView => {
  const legacy = legacyManualPayment(manual);
  const offered = legacy.crypto.enabled || legacy.manager.enabled;

  return {
    enabled: offered,
    requisites: offered
      ? manual.requisites.map((item) =>
          item.kind === "crypto" ? { ...item, icon: cryptoIconFor(item.currency) } : item,
        )
      : [],
    contacts: offered ? manual.contacts : null,
    crypto: legacy.crypto.enabled ? { enabled: true, wallets: legacy.crypto.wallets } : { enabled: false },
    manager: legacy.manager.enabled ? { ...legacy.manager, enabled: true } : { enabled: false },
  };
};
