import type { HttpTypes } from "@medusajs/types"

/**
 * What the customer is shown about an order's progress: the tracking numbers
 * the shop owner typed, and how far along the order's own statuses have got.
 *
 * Both used to be inline in the components that render them, and the tracking
 * half was copied in four places (the account timeline, the shipping-details
 * section and, on the backend, the shipment e-mail and its text fallback).
 * One copy is a function with a test; four copies are four chances for the
 * carrier to go missing from one surface, which is exactly how the e-mail
 * shipped a bare number while the panel showed «СДЭК 1005248796431».
 */

/** A fulfillment as far as tracking is concerned; the Store API types the relation loosely. */
export type TrackedFulfillment = {
  labels?: { tracking_number?: string | null; tracking_url?: string | null }[] | null
  metadata?: Record<string, unknown> | null
}

/** One tracking line and the carrier's tracking page for it, when the label has one. */
export type TrackingEntry = { line: string; url: string | null }

/** Only a web address is a link: anything else in `tracking_url` is not one to follow. */
const webUrl = (raw: string | null | undefined): string | null => {
  const url = raw?.trim() ?? ""
  return /^https?:\/\//i.test(url) ? url : null
}

/**
 * «СДЭК 1005248796431» — the carrier the owner typed (`metadata.carrier`) in
 * front of each tracking number, one line per label. A label with no number is
 * not a line, and a fulfillment with no carrier gives the bare number rather
 * than a leading space.
 *
 * `url` is the label's `tracking_url`. ApiShip's status sync writes it with the
 * carrier's number (t-2026-10-14-58); a number the owner typed by hand has none.
 */
export const trackingEntries = (
  fulfillments: TrackedFulfillment[] | null | undefined
): TrackingEntry[] =>
  (fulfillments ?? []).flatMap((fulfillment) => {
    const raw = fulfillment.metadata?.carrier
    const carrier = typeof raw === "string" && raw.trim() ? raw.trim() : null

    return (fulfillment.labels ?? []).flatMap((label) => {
      const number = label.tracking_number?.trim()
      if (!number) return []
      return [{ line: carrier ? `${carrier} ${number}` : number, url: webUrl(label.tracking_url) }]
    })
  })

export const trackingLines = (
  fulfillments: TrackedFulfillment[] | null | undefined
): string[] => trackingEntries(fulfillments).map((entry) => entry.line)

export type TimelineStepKey =
  | "placed"
  | "confirmed"
  | "atPickupPoint"
  | "received"

export const TIMELINE_STEP_KEYS: TimelineStepKey[] = [
  "placed",
  "confirmed",
  "atPickupPoint",
  "received",
]

export type TimelineProgress = {
  done: Record<TimelineStepKey, boolean>
  /** Dates for the steps already reached; `null` for a step still ahead. */
  dates: Record<TimelineStepKey, string | Date | null | undefined>
  /** The step the order is working on, or `null` once every step is done. */
  current: TimelineStepKey | null
}

type TimelineOrder = Pick<
  HttpTypes.StoreOrder,
  "created_at" | "payment_status" | "fulfillment_status"
> & {
  fulfillments?: (TrackedFulfillment & {
    packed_at?: string | Date | null
    shipped_at?: string | Date | null
    delivered_at?: string | Date | null
  })[]
  payment_collections?: { payments?: { captured_at?: string | Date | null }[] }[]
}

/**
 * Where the order stands, in the four steps the account screen draws. Every
 * step reads an existing order enum, never an invented status (rule 17a):
 * Placed = it exists; Confirmed = `payment_status === "captured"`; "At the
 * pickup point" = `fulfillment_status` past `fulfilled` (Medusa's "fulfilled"
 * means "packed and ready", which for a pickup order IS pickup-ready);
 * Received = `fulfillment_status === "delivered"`.
 *
 * A later step being done implies the earlier one: an order marked delivered
 * is also past the pickup point, whatever order the statuses arrived in.
 */
export const timelineProgress = (order: TimelineOrder): TimelineProgress => {
  const fulfillment = order.fulfillments?.[0]
  const payment = order.payment_collections?.[0]?.payments?.[0]

  const done: Record<TimelineStepKey, boolean> = {
    placed: true,
    confirmed: order.payment_status === "captured",
    atPickupPoint:
      order.fulfillment_status === "fulfilled" ||
      order.fulfillment_status === "shipped" ||
      order.fulfillment_status === "delivered",
    received: order.fulfillment_status === "delivered",
  }

  const dates: TimelineProgress["dates"] = {
    placed: order.created_at,
    confirmed: done.confirmed ? payment?.captured_at : null,
    atPickupPoint: done.atPickupPoint
      ? fulfillment?.shipped_at ?? fulfillment?.packed_at
      : null,
    received: done.received ? fulfillment?.delivered_at : null,
  }

  const pending = TIMELINE_STEP_KEYS.find((key) => !done[key])

  return { done, dates, current: pending ?? null }
}
