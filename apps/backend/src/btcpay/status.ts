import { PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * A BTCPay invoice status read as a Medusa payment session status
 * (ask-20261005-070255-438f, the table in the research's `payment-flow.md`).
 * The enums are Greenfield's `InvoiceStatus` and `InvoiceAdditionalStatus`
 * (swagger v2.4.4).
 *
 * | BTCPay                                          | Medusa          |
 * |-------------------------------------------------|-----------------|
 * | New, Processing                                 | `pending`       |
 * | Settled, any additional status (PaidOver, Marked) | `captured`    |
 * | Expired with PaidPartial or PaidLate            | `requires_more` |
 * | Expired otherwise                               | `canceled`      |
 * | Invalid                                         | `error`         |
 *
 * Processing means the payment is seen but not yet confirmed as often as the
 * store's speed policy asks, so it never captures. Settled is the only status
 * that does, and a status this table does not know reads as `pending`: a
 * future BTCPay value must never turn into a paid order by default.
 */
export const mapBtcpayInvoiceStatus = (
  status: string | null | undefined,
  additionalStatus?: string | null,
): PaymentSessionStatus => {
  switch (status) {
    case "Settled":
      return PaymentSessionStatus.CAPTURED;
    case "Expired":
      return additionalStatus === "PaidPartial" || additionalStatus === "PaidLate"
        ? PaymentSessionStatus.REQUIRES_MORE
        : PaymentSessionStatus.CANCELED;
    case "Invalid":
      return PaymentSessionStatus.ERROR;
    case "New":
    case "Processing":
    default:
      return PaymentSessionStatus.PENDING;
  }
};

/**
 * Whether BTCPay can still change its mind about this invoice: it is open, or
 * expired but inside its monitoring window, where a late payment turns it into
 * Expired/PaidLate and the owner can still mark it settled.
 */
export const isBtcpayInvoiceOpen = (
  status: string | null | undefined,
  monitoringExpiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (status === "Settled" || status === "Invalid") {
    return false;
  }
  if (status !== "Expired") {
    return true;
  }
  return Boolean(monitoringExpiresAt) && new Date(monitoringExpiresAt as string).getTime() > now.getTime();
};
