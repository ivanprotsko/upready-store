"use server"

import { sdk } from "@lib/config"
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@lib/util/payment-receipt"
import { getAuthHeaders } from "./cookies"

/**
 * The buyer's «Я оплатил» (t-cherk-com-hotfix batch 3): one receipt for an
 * order paid by a transfer to the shop's card, forwarded to
 * `POST /store/tenant/orders/:id/payment-receipt`, which stores it on the order
 * and tells the owner. The size and type are checked here first so a wrong
 * file never travels to the backend; the backend checks both again.
 *
 * `next.config.js` raises `serverActions.bodySizeLimit` above `RECEIPT_MAX_BYTES`.
 */
export type PaymentReceiptResult =
  | { ok: true }
  | { ok: false; error: "receiptTooLarge" | "receiptWrongType" | "receiptFailed" }

export async function submitPaymentReceipt(
  orderId: string,
  formData: FormData
): Promise<PaymentReceiptResult> {
  const file = formData.get("receipt")

  if (!(file instanceof File) || file.size === 0 || !RECEIPT_TYPES.includes(file.type)) {
    return { ok: false, error: "receiptWrongType" }
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return { ok: false, error: "receiptTooLarge" }
  }

  const body = new FormData()
  body.append("files", file, file.name)

  try {
    await sdk.client.fetch(`/store/tenant/orders/${orderId}/payment-receipt`, {
      method: "POST",
      headers: { ...(await getAuthHeaders()), "content-type": null },
      body,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "receiptFailed" }
  }
}
