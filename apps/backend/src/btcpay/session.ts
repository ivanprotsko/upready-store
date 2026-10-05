import { PaymentSessionStatus } from "@medusajs/framework/utils";
import { sameAmount } from "./amount";
import type { BtcpayInvoice } from "./client";
import { mapBtcpayInvoiceStatus } from "./status";

export const BTCPAY_PROVIDER_ID = "pp_btcpay_btcpay";

/** One refund the owner opened: a pull payment the buyer claims on `view_link`. */
export type BtcpayRefund = {
  pull_payment_id: string;
  view_link: string | null;
  /** Decimal string in `currency`, the amount the panel asked to refund. */
  amount: string;
  currency: string;
  created_at: string;
};

/**
 * What the provider keeps on `payment_session.data` (ask-20261005-070255-438f).
 * Safe to hand to the storefront: the checkout link and the invoice id are what
 * the buyer's browser opens anyway, and nothing here is a credential.
 *
 * Every field below `checkout_link` is the SERVER's reading of the invoice,
 * written by `initiatePayment`, by a status read the provider made itself, by
 * the webhook or by the sweep job. None of them is ever taken from a request
 * body: the store middleware (`api/store/tenant/btcpay.ts`) passes the client
 * only `return_url` and `locale`.
 */
export type BtcpaySessionData = {
  provider: "btcpay";
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
  /** Greenfield `InvoiceStatus` as last read from the server. */
  invoice_status: string;
  /** Greenfield `InvoiceAdditionalStatus` as last read from the server. */
  additional_status: string | null;
  expires_at: string | null;
  /** Until when BTCPay still watches an expired invoice for a late payment. */
  monitoring_expires_at: string | null;
  /** ISO time the server first reported the invoice Settled; `null` until then. */
  confirmed_at: string | null;
  /** The last webhook event type that touched this session, for the log. */
  last_event: string | null;
  /** Set when the server's invoice does not match this session; such an invoice never captures. */
  last_error: string | null;
  refunds: BtcpayRefund[];
};

/** A unix time in seconds, as Greenfield sends it, as ISO; `null` when absent. */
export const unixToIso = (seconds: unknown): string | null =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;

/**
 * Why `invoice` cannot be the invoice this session was paid with, or `null`
 * when it is. The id, the store, the currency and the amount all have to agree:
 * a settled invoice for a different amount, or one another store issued, must
 * never complete this cart. `expectedAmount` is the session's own amount when
 * the caller has it (the webhook and the sweep read it from the row);
 * otherwise the amount the invoice was created for.
 */
export const invoiceMismatch = (
  invoice: BtcpayInvoice,
  data: Pick<BtcpaySessionData, "invoice_id" | "store_id" | "amount" | "currency_code">,
  expectedAmount?: unknown,
): string | null => {
  if (invoice.id !== data.invoice_id) {
    return "invoice_id";
  }
  if (invoice.storeId !== data.store_id) {
    return "store_id";
  }
  if (String(invoice.currency ?? "").toLowerCase() !== data.currency_code) {
    return "currency";
  }
  if (!sameAmount(invoice.amount, data.amount, data.currency_code)) {
    return "amount";
  }
  if (expectedAmount !== undefined && !sameAmount(invoice.amount, expectedAmount, data.currency_code)) {
    return "amount";
  }
  return null;
};

export type InvoiceReading = {
  status: PaymentSessionStatus;
  data: BtcpaySessionData;
  /** Whether `data` differs from what the session holds, so the caller writes only on a change. */
  changed: boolean;
  mismatch: string | null;
};

const TRACKED_FIELDS = [
  "invoice_status",
  "additional_status",
  "expires_at",
  "monitoring_expires_at",
  "confirmed_at",
  "last_event",
  "last_error",
] as const;

/**
 * The session's data after one reading of its invoice from the server. A
 * mismatched invoice reads as `error` and leaves the stored status fields as
 * they were; a Settled one stamps `confirmed_at` once and keeps the first stamp.
 */
export const readInvoiceInto = (
  data: BtcpaySessionData,
  invoice: BtcpayInvoice,
  options: { event?: string | null; expectedAmount?: unknown; now?: Date } = {},
): InvoiceReading => {
  const now = options.now ?? new Date();
  const mismatch = invoiceMismatch(invoice, data, options.expectedAmount);

  const next: BtcpaySessionData = mismatch
    ? { ...data, last_error: `invoice_mismatch:${mismatch}` }
    : {
        ...data,
        invoice_status: String(invoice.status),
        additional_status: invoice.additionalStatus ? String(invoice.additionalStatus) : null,
        expires_at: unixToIso(invoice.expirationTime) ?? data.expires_at ?? null,
        monitoring_expires_at: unixToIso(invoice.monitoringExpiration) ?? data.monitoring_expires_at ?? null,
        last_error: null,
      };
  if (options.event) {
    next.last_event = options.event;
  }

  const status = mismatch
    ? PaymentSessionStatus.ERROR
    : mapBtcpayInvoiceStatus(next.invoice_status, next.additional_status);
  if (status === PaymentSessionStatus.CAPTURED && !next.confirmed_at) {
    next.confirmed_at = now.toISOString();
  }

  const changed = TRACKED_FIELDS.some((field) => (data[field] ?? null) !== (next[field] ?? null));
  return { status, data: next, changed, mismatch };
};
