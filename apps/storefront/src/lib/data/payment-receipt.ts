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

/** The type a camera photo or a shared file arrives without on some phones, read off its name. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
}

const typeOf = (file: File): string => {
  if (file.type) {
    return file.type
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return TYPE_BY_EXTENSION[extension] ?? ""
}

export async function submitPaymentReceipt(
  orderId: string,
  formData: FormData
): Promise<PaymentReceiptResult> {
  const raw = formData.get("receipt")

  if (!(raw instanceof File) || raw.size === 0) {
    return { ok: false, error: "receiptWrongType" }
  }
  const type = typeOf(raw)
  if (!RECEIPT_TYPES.includes(type)) {
    return { ok: false, error: "receiptWrongType" }
  }
  if (raw.size > RECEIPT_MAX_BYTES) {
    return { ok: false, error: "receiptTooLarge" }
  }
  // Batch 7: a phone's camera can hand over a photo with no MIME type at all; the
  // backend checks the type it receives, so the inferred one travels with the file.
  const file = raw.type ? raw : new File([raw], raw.name, { type })

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
