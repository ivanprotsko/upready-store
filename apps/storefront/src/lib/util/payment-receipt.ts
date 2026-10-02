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
