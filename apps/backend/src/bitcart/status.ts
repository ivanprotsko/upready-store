import { PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * A Bitcart invoice status read as a Medusa payment session status
 * (ask-20261005-070255-438f, stage 2; the table in the research's
 * `payment-flow.md`). The values are Bitcart's `InvoiceStatus` and
 * `InvoiceExceptionStatus` (`api/invoices.py`, master at e3bf1016).
 *
 * | Bitcart                                         | Medusa          |
 * |-------------------------------------------------|-----------------|
 * | pending, paid, unconfirmed, confirmed           | `pending`       |
 * | complete, any exception status (paid_over)      | `captured`      |
 * | expired with paid_partial                       | `requires_more` |
 * | expired otherwise                               | `canceled`      |
 * | refunded                                        | `canceled`      |
 * | invalid                                         | `error`         |
 *
 * `paid` means the transfer is seen, `confirmed` that it has one block, and
 * `complete` that it has as many as the store's `transaction_speed` asks, so
 * only `complete` captures. A status this table does not know reads as
 * `pending`: a future Bitcart value must never turn into a paid order by
 * default. `refunded` is reached only after the owner sent money back, so an
 * invoice that is refunded before this shop ever captured it has nothing left
 * to complete.
 */
export const mapBitcartInvoiceStatus = (
  status: string | null | undefined,
  exceptionStatus?: string | null,
): PaymentSessionStatus => {
  switch (status) {
    case "complete":
      return PaymentSessionStatus.CAPTURED;
    case "expired":
      return exceptionStatus === "paid_partial" ? PaymentSessionStatus.REQUIRES_MORE : PaymentSessionStatus.CANCELED;
    case "refunded":
      return PaymentSessionStatus.CANCELED;
    case "invalid":
      return PaymentSessionStatus.ERROR;
    case "pending":
    case "paid":
    case "unconfirmed":
    case "confirmed":
    default:
      return PaymentSessionStatus.PENDING;
  }
};

/**
 * Statuses the sweep stops reading: Bitcart leaves `complete` only for
 * `refunded`, which is the owner's own act, and `invalid` and `refunded`
 * never. `complete` is not listed: such a session is either paid already or
 * still waiting for its completion to be retried.
 */
export const BITCART_SETTLED_FOR_GOOD = ["invalid", "refunded"] as const;

/**
 * How long after an invoice expires the sweep still reads it. Bitcart has no
 * «paid after expiry» status of its own (`api/invoices.py`), and whether a
 * transfer that lands late moves an expired invoice on is not documented, so
 * the platform keeps watching for a day, the window BTCPay itself uses by
 * default (`monitoringExpiration`).
 */
export const BITCART_WATCH_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;
