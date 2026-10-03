/**
 * What a payment receipt may be (t-cherk-com-hotfix batch 3), shared by the
 * order page's form and its server action (`lib/data/payment-receipt.ts`, a
 * `"use server"` module, which may export async functions only). The backend
 * route checks the same two limits again.
 */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

export const RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]

/** `order.metadata.payment_receipt`, as the storefront reads it (batch 6, Q3.3 contract). */
export type PaymentReceiptState = {
  /** A receipt is on the order and still waits for the shop. */
  sent: boolean
  /** The shop did not accept the last receipt (`status === "rejected"`), with its reason and when. */
  rejected: { reason: string | null; at: string | null } | null
}

export const readPaymentReceipt = (
  metadata: Record<string, unknown> | null | undefined
): PaymentReceiptState => {
  const raw = metadata?.payment_receipt
  if (!raw || typeof raw !== "object") {
    return { sent: false, rejected: null }
  }
  const receipt = raw as Record<string, unknown>
  if (receipt.status === "rejected") {
    return {
      sent: false,
      rejected: {
        reason: typeof receipt.rejected_reason === "string" ? receipt.rejected_reason : null,
        at: typeof receipt.rejected_at === "string" ? receipt.rejected_at : null,
      },
    }
  }
  // No `status` (or any other value): sent and waiting.
  return { sent: true, rejected: null }
}
