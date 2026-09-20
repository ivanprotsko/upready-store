import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import { getLocale, getTranslations } from "next-intl/server"

import { formatDate } from "@lib/util/date"
import {
  TIMELINE_STEP_KEYS,
  timelineProgress,
  trackingLines,
  type TimelineStepKey,
} from "@lib/util/order-tracking"
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

type StepKey = TimelineStepKey
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

  const { done, dates, current } = timelineProgress(order)

  // The tracking number(s) the shop owner typed on the shipment, with the
  // carrier in front («СДЭК 1234567890») — one assembly shared with the
  // shipping-details section (`@lib/util/order-tracking`).
  const tracking = trackingLines(order.fulfillments)

  const steps: Step[] = TIMELINE_STEP_KEYS.map((key) => {
    const state: StepState = done[key]
      ? "done"
      : key === current
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
    <div className="flex flex-col gap-y-4">
    <div
      className="flex items-start"
      data-testid="order-timeline"
      data-value={current ?? "complete"}
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
    {tracking.length > 0 && (
      <div className="flex flex-col gap-y-0.5" data-testid="order-tracking">
        <span className="txt-compact-small-plus text-ui-fg-base">
          {t("trackingNumber")}
        </span>
        {tracking.map((line) => (
          <span
            key={line}
            className="txt-compact-small text-ui-fg-subtle tabular-nums"
            data-testid="order-tracking-number"
          >
            {line}
          </span>
        ))}
      </div>
    )}
    </div>
  )
}

export default OrderTimeline
