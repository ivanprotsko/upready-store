import { PaymentSessionStatus } from "@medusajs/framework/utils";
import { sameAmount } from "./amount";
import type { BitcartInvoice } from "./client";
import { BITCART_WATCH_AFTER_EXPIRY_MS, mapBitcartInvoiceStatus } from "./status";

export const BITCART_PROVIDER_ID = "pp_bitcart_bitcart";

/** One refund the owner opened: a refund request the buyer claims on `claim_link`. */
export type BitcartRefundRecord = {
  refund_id: string;
  claim_link: string | null;
  /** Decimal string in `currency`, the amount the panel asked to refund. */
  amount: string;
  currency: string;
  created_at: string;
};

/**
 * What the provider keeps on `payment_session.data` (ask-20261005-070255-438f,
 * stage 2), the counterpart of `BtcpaySessionData`. Safe to hand to the
 * storefront: the checkout link and the invoice id are what the buyer's
 * browser opens anyway, and nothing here is a credential.
 *
 * Every field below `checkout_link` is the SERVER's reading of the invoice,
 * written by `initiatePayment`, by a status read the provider made itself, by
 * the notification route or by the sweep job. None of them is ever taken from
 * a request body: the store middleware (`api/store/tenant/bitcart.ts`) passes
 * the client only `return_url`.
 */
export type BitcartSessionData = {
  provider: "bitcart";
  tenant_id: string;
  session_id: string;
  invoice_id: string;
  store_id: string;
  checkout_link: string;
  /** The decimal string the invoice was created for, in `currency_code`. */
  amount: string;
  /** Lower case, like Medusa's own `currency_code`. */
  currency_code: string;
  return_url: string | null;
  /** Bitcart `InvoiceStatus` as last read from the server. */
  invoice_status: string;
  /** Bitcart `InvoiceExceptionStatus` as last read from the server. */
  exception_status: string | null;
  expires_at: string | null;
  /** Until when the sweep still reads an expired invoice (`BITCART_WATCH_AFTER_EXPIRY_MS`). */
  watch_until: string | null;
  /** ISO time the server first reported the invoice complete; `null` until then. */
  confirmed_at: string | null;
  /** The last status a notification announced, for the log. Never trusted. */
  last_event: string | null;
  /** Set when the server's invoice does not match this session; such an invoice never captures. */
  last_error: string | null;
  refunds: BitcartRefundRecord[];
};

/**
 * When `invoice` stops being payable, as ISO: its creation time plus
 * `expiration` minutes. `null` when the server sent neither.
 */
export const bitcartExpiresAt = (invoice: Pick<BitcartInvoice, "created" | "expiration">): string | null => {
  const created = typeof invoice.created === "string" ? Date.parse(invoice.created) : Number.NaN;
  const minutes = typeof invoice.expiration === "number" ? invoice.expiration : Number.NaN;
  if (!Number.isFinite(created) || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return new Date(created + minutes * 60_000).toISOString();
};

/** The end of the sweep's watch over an invoice that expires at `expiresAt`. */
export const bitcartWatchUntil = (expiresAt: string | null): string | null =>
  expiresAt ? new Date(Date.parse(expiresAt) + BITCART_WATCH_AFTER_EXPIRY_MS).toISOString() : null;

/**
 * Why `invoice` cannot be the invoice this session was paid with, or `null`
 * when it is. The id, the store, the currency and the price all have to agree.
 * Bitcart serves any invoice to anyone who knows its id, so the store check is
 * the one that keeps another shop's paid invoice off this cart.
 * `expectedAmount` is the session's own amount when the caller has it (the
 * notification route and the sweep read it from the row).
 */
export const bitcartInvoiceMismatch = (
  invoice: BitcartInvoice,
  data: Pick<BitcartSessionData, "invoice_id" | "store_id" | "amount" | "currency_code">,
  expectedAmount?: unknown,
): string | null => {
  if (invoice.id !== data.invoice_id) {
    return "invoice_id";
  }
  if (invoice.store_id !== data.store_id) {
    return "store_id";
  }
  if (String(invoice.currency ?? "").toLowerCase() !== data.currency_code) {
    return "currency";
  }
  if (!sameAmount(invoice.price, data.amount, data.currency_code)) {
    return "amount";
  }
  if (expectedAmount !== undefined && !sameAmount(invoice.price, expectedAmount, data.currency_code)) {
    return "amount";
  }
  return null;
};

export type BitcartInvoiceReading = {
  status: PaymentSessionStatus;
  data: BitcartSessionData;
  /** Whether `data` differs from what the session holds, so the caller writes only on a change. */
  changed: boolean;
  mismatch: string | null;
};

const TRACKED_FIELDS = [
  "invoice_status",
  "exception_status",
  "expires_at",
  "watch_until",
  "confirmed_at",
  "last_event",
  "last_error",
] as const;

/**
 * The session's data after one reading of its invoice from the server. A
 * mismatched invoice reads as `error` and leaves the stored status fields as
 * they were; a complete one stamps `confirmed_at` once and keeps the first stamp.
 */
export const readBitcartInvoiceInto = (
  data: BitcartSessionData,
  invoice: BitcartInvoice,
  options: { event?: string | null; expectedAmount?: unknown; now?: Date } = {},
): BitcartInvoiceReading => {
  const now = options.now ?? new Date();
  const mismatch = bitcartInvoiceMismatch(invoice, data, options.expectedAmount);
  const expiresAt = bitcartExpiresAt(invoice) ?? data.expires_at ?? null;

  const next: BitcartSessionData = mismatch
    ? { ...data, last_error: `invoice_mismatch:${mismatch}` }
    : {
        ...data,
        invoice_status: String(invoice.status),
        exception_status: invoice.exception_status ? String(invoice.exception_status) : null,
        expires_at: expiresAt,
        watch_until: bitcartWatchUntil(expiresAt) ?? data.watch_until ?? null,
        last_error: null,
      };
  if (options.event) {
    next.last_event = options.event;
  }

  const status = mismatch
    ? PaymentSessionStatus.ERROR
    : mapBitcartInvoiceStatus(next.invoice_status, next.exception_status);
  if (status === PaymentSessionStatus.CAPTURED && !next.confirmed_at) {
    next.confirmed_at = now.toISOString();
  }

  const changed = TRACKED_FIELDS.some((field) => (data[field] ?? null) !== (next[field] ?? null));
  return { status, data: next, changed, mismatch };
};
