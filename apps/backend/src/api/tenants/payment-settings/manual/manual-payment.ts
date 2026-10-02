/**
 * The shop's two OFFLINE ways to pay (olavka-payments): a crypto transfer to
 * the owner's own wallets and «card via manager», where the owner and the buyer
 * settle by messenger. Both run on Medusa's built-in `pp_system_default`
 * provider, so there is no payment module behind them and nothing is captured
 * automatically: the order stays «awaiting payment» until the owner captures it
 * in the panel (`api/tenants/payments/[id]/capture`).
 *
 * Lives in `tenant.metadata.manual_payment`, the same convention `branding`,
 * `analytics` and `seo_verification` use (one JSON document per concern, merged
 * on every write so a route never clobbers a sibling key), rather than a new
 * model and migration for two small sections.
 *
 * Wallet addresses and manager contacts are the OWNER's data, entered per shop
 * through `PUT /tenants/payment-settings/manual`. Nothing here carries a default
 * address or a default phone number: a section the owner has not filled in is
 * a section the checkout does not offer.
 */

export type ManualPaymentWallet = {
  /** The chain the address lives on, as the buyer needs to see it: "TRC-20", "ERC-20". */
  network: string;
  /** The asset: "USDT", "USDC". */
  currency: string;
  address: string;
};

export type ManualPaymentCrypto = {
  enabled: boolean;
  wallets: ManualPaymentWallet[];
};

/** A bank card the buyer transfers to, shown with the manager section (Ivan, 02.10: cards first, the manager «just in case»). */
export type ManualPaymentCard = {
  bank: string;
  number: string;
  /** The holder's name as the buyer's bank shows it on a transfer, or null when the owner leaves it out. */
  holder: string | null;
};

export type ManualPaymentManager = {
  enabled: boolean;
  /** Up to five cards; empty keeps the section a plain «card via manager». */
  cards: ManualPaymentCard[];
  /** Digits only, with an optional leading `+`: what `https://wa.me/<number>` takes. */
  whatsapp: string | null;
  /** The username without the `@`: what `https://t.me/<username>` takes. */
  telegram: string | null;
  email: string | null;
  /** Free text the checkout shows under the method, e.g. which transfers the owner accepts. */
  note: string | null;
};

export type TenantManualPayment = {
  crypto: ManualPaymentCrypto;
  manager: ManualPaymentManager;
};

export const EMPTY_MANUAL_PAYMENT: TenantManualPayment = {
  crypto: { enabled: false, wallets: [] },
  manager: { enabled: false, cards: [], whatsapp: null, telegram: null, email: null, note: null },
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readWallets = (raw: unknown): ManualPaymentWallet[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const wallets: ManualPaymentWallet[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const wallet = item as Partial<ManualPaymentWallet>;
    const network = str(wallet.network);
    const currency = str(wallet.currency);
    const address = str(wallet.address);
    if (network && currency && address) {
      wallets.push({ network, currency, address });
    }
  }

  return wallets;
};

const readCards = (raw: unknown): ManualPaymentCard[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const cards: ManualPaymentCard[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const card = item as Partial<ManualPaymentCard>;
    const bank = str(card.bank);
    const number = str(card.number);
    if (bank && number) {
      cards.push({ bank, number, holder: str(card.holder) });
    }
  }

  return cards;
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
  const raw = (metadata?.manual_payment ?? null) as Partial<TenantManualPayment> | null;

  if (!raw || typeof raw !== "object") {
    return EMPTY_MANUAL_PAYMENT;
  }

  const crypto = raw.crypto && typeof raw.crypto === "object" ? raw.crypto : null;
  const manager = raw.manager && typeof raw.manager === "object" ? raw.manager : null;

  return {
    crypto: {
      enabled: Boolean(crypto?.enabled),
      wallets: readWallets(crypto?.wallets),
    },
    manager: {
      enabled: Boolean(manager?.enabled),
      cards: readCards(manager?.cards),
      whatsapp: str(manager?.whatsapp),
      telegram: str(manager?.telegram),
      email: str(manager?.email),
      note: str(manager?.note),
    },
  };
};

/**
 * What `GET /storefront/by-host` publishes. A crypto section with no wallet is
 * not a way to pay, so it is off; and a section that is off carries no
 * addresses and no contacts at all, because the storefront's only use for
 * them is to offer the method.
 */
export type ManualPaymentPublicView = {
  crypto: { enabled: true; wallets: ManualPaymentWallet[] } | { enabled: false };
  manager:
    | {
        enabled: true;
        cards: ManualPaymentCard[];
        whatsapp: string | null;
        telegram: string | null;
        email: string | null;
        note: string | null;
      }
    | { enabled: false };
};

export const manualPaymentPublicView = (
  manual: TenantManualPayment,
): ManualPaymentPublicView => ({
  crypto:
    manual.crypto.enabled && manual.crypto.wallets.length > 0
      ? { enabled: true, wallets: manual.crypto.wallets }
      : { enabled: false },
  manager: manual.manager.enabled
    ? {
        enabled: true,
        cards: manual.manager.cards,
        whatsapp: manual.manager.whatsapp,
        telegram: manual.manager.telegram,
        email: manual.manager.email,
        note: manual.manager.note,
      }
    : { enabled: false },
});
