import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import { getLocale, getTranslations } from "next-intl/server"

import { formatDate } from "@lib/util/date"
import StatusDot from "@modules/account/components/status-dot"

/**
 * Placed → Confirmed → At the pickup point → Received, drawn only for a pickup
 * order (`account-mockup.md` §4a: a courier order keeps the plain status-dot
 * pair instead — `order-details-template` decides which one to render). Steps
 * reuse existing order enums (rule 17a, no invented status): Placed =
 * `created_at`; Confirmed = `payment_status === "captured"`; "At the pickup
 * point" = `fulfillment_status === "fulfilled"` (Medusa's "fulfilled" means
 * "ready", which for a pickup order *is* pickup-ready); Received =
 * `fulfillment_status === "delivered"`.
 */

type StepKey = "placed" | "confirmed" | "atPickupPoint" | "received"
type StepState = "done" | "current" | "upcoming"

type Step = {
  key: StepKey
  label: string
  date: string | null
  state: StepState
}

type OrderTimelineProps = {
  order: HttpTypes.StoreOrder
}

const STEP_KEYS: StepKey[] = ["placed", "confirmed", "atPickupPoint", "received"]

const OrderTimeline = async ({ order }: OrderTimelineProps) => {
  const [t, locale] = await Promise.all([
    getTranslations("OrderTimeline"),
    getLocale(),
  ])

  if (order.status === "canceled") {
    const canceledAt = (order as { canceled_at?: string | Date | null })
      .canceled_at
    return (
      <div data-testid="order-timeline-canceled">
        <StatusDot
          tone="red"
          label={
            canceledAt
              ? t("canceledOn", {
                  date: formatDate({ date: canceledAt, locale, dateStyle: "long" }),
                })
              : t("canceledUnknownDate")
          }
        />
      </div>
    )
  }

  const fulfillment = order.fulfillments?.[0]
  const payment = order.payment_collections?.[0]?.payments?.[0]

  const done = {
    placed: true,
    confirmed: order.payment_status === "captured",
    atPickupPoint:
      order.fulfillment_status === "fulfilled" ||
      order.fulfillment_status === "delivered",
    received: order.fulfillment_status === "delivered",
  }

  const dates: Record<StepKey, string | Date | null | undefined> = {
    placed: order.created_at,
    confirmed: done.confirmed ? payment?.captured_at : null,
    atPickupPoint: done.atPickupPoint
      ? fulfillment?.shipped_at ?? fulfillment?.packed_at
      : null,
    received: done.received ? fulfillment?.delivered_at : null,
  }

  const doneFlags = STEP_KEYS.map((key) => done[key])
  const firstPending = doneFlags.findIndex((flag) => !flag)

  const steps: Step[] = STEP_KEYS.map((key, index) => {
    const state: StepState = doneFlags[index]
      ? "done"
      : index === firstPending
        ? "current"
        : "upcoming"
    const rawDate = dates[key]
    return {
      key,
      label: t(key),
      date: rawDate ? formatDate({ date: rawDate, locale, dateStyle: "medium" }) : null,
      state,
    }
  })

  return (
    <div
      className="flex items-start"
      data-testid="order-timeline"
      data-value={firstPending === -1 ? "complete" : STEP_KEYS[firstPending]}
    >
      {steps.map((step, index) => (
        <div
          key={step.key}
          className={clx("flex items-start", index === steps.length - 1 ? "flex-none" : "flex-1")}
        >
          {index > 0 && (
            // No minimum width: on a 390 px account column four 64 px labels
            // plus three connectors must never force the row wider than its
            // container (rule: no horizontal scroll on the page body).
            <div
              className={clx("mt-[5px] h-px min-w-2 flex-1", {
                "bg-ui-fg-interactive": steps[index - 1].state === "done" && step.state === "done",
                "bg-gradient-to-r from-ui-fg-interactive from-50% to-ui-border-base to-50%":
                  step.state === "current",
                "bg-ui-border-base": step.state === "upcoming",
              })}
              aria-hidden="true"
            />
          )}
          <div className="flex w-16 shrink-0 flex-col items-center gap-y-2 text-center">
            <span
              className={clx("h-[11px] w-[11px] shrink-0 rounded-full border-2", {
                "bg-ui-fg-interactive border-ui-fg-interactive": step.state !== "upcoming",
                "bg-ui-bg-base border-ui-border-base": step.state === "upcoming",
              })}
              aria-hidden="true"
              data-testid={`order-timeline-step-${step.key}`}
              data-value={step.state}
            />
            <span
              className={clx("txt-compact-small-plus", {
                "text-ui-fg-base": step.state !== "upcoming",
                "text-ui-fg-subtle": step.state === "upcoming",
              })}
            >
              {step.label}
            </span>
            {step.date && (
              <span className="txt-compact-xsmall text-ui-fg-subtle tabular-nums">
                {step.date}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default OrderTimeline
