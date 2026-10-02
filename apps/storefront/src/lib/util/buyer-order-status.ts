import type { HttpTypes } from "@medusajs/types"

import { readPaymentReceipt } from "./payment-receipt"
import type { StatusTone } from "./order-status"

/**
 * The ONE status a buyer reads on an order (batch 7, Ivan 03.10: «его заказ
 * переходит в статус "Ожидает подтверждения оплаты"»), derived from Medusa's
 * payment status and the receipt the buyer attached (`metadata.payment_receipt`).
 * Medusa's own words — «authorized», «not fulfilled» — mean nothing to a buyer;
 * the panel shows the same five states in the same words (the hotfix worker's
 * batch 6), so the buyer and the owner read one order the same way.
 *
 * - `canceled`: the shop cancelled the order; nothing to pay.
 * - `paid`: the payment was captured (a gateway did it, or the owner confirmed a transfer).
 * - `refunded`: the money went back.
 * - `receiptRejected`: the shop did not accept the last receipt; the buyer sends another.
 * - `awaitingConfirmation`: a receipt is in, the shop has not confirmed it yet.
 * - `awaitingPayment`: nothing paid, nothing sent — the order waits for the transfer.
 */
export type BuyerOrderStatus =
  | "awaitingPayment"
  | "awaitingConfirmation"
  | "receiptRejected"
  | "paid"
  | "refunded"
  | "canceled"

export type BuyerStatusOrder = Pick<HttpTypes.StoreOrder, "status" | "payment_status"> & {
  metadata?: Record<string, unknown> | null
}

export const buyerOrderStatus = (order: BuyerStatusOrder): BuyerOrderStatus => {
  if (order.status === "canceled") {
    return "canceled"
  }
  const payment = order.payment_status ?? ""
  if (payment === "refunded" || payment === "partially_refunded") {
    return "refunded"
  }
  if (payment === "captured" || payment === "partially_captured") {
    return "paid"
  }
  const receipt = readPaymentReceipt(order.metadata)
  if (receipt.rejected) {
    return "receiptRejected"
  }
  if (receipt.sent) {
    return "awaitingConfirmation"
  }
  return "awaitingPayment"
}

/** Whether the order still waits for the buyer's payment: nothing captured, not cancelled. */
export const awaitsPayment = (order: BuyerStatusOrder): boolean => {
  const status = buyerOrderStatus(order)
  return status === "awaitingPayment" || status === "awaitingConfirmation" || status === "receiptRejected"
}

/**
 * The colour each state is drawn in, on the same tag tokens the account's status
 * dots and the order page's badges already use: neutral for nothing done yet,
 * orange for «in the shop's hands», green for done, red for something that needs
 * the buyer's attention.
 */
export const BUYER_STATUS_TONES: Record<BuyerOrderStatus, StatusTone> = {
  awaitingPayment: "orange",
  awaitingConfirmation: "blue",
  receiptRejected: "red",
  paid: "green",
  refunded: "neutral",
  canceled: "red",
}
