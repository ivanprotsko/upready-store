import type { HttpTypes } from "@medusajs/types"
import { Heading, StatusBadge, Text, clx } from "@medusajs/ui"
import type { ReactNode } from "react"
import { getTranslations } from "next-intl/server"

import {
  ORDER_STAGE_TONES,
  orderDelivery,
  orderStage,
  orderStageHint,
  orderStageProgress,
  type StageOrder,
} from "@lib/util/order-stage"
import type { StatusTone } from "@lib/util/order-status"
import { trackingDisplay, trackingEntries } from "@lib/util/order-tracking"
import TrackingLine from "@modules/order/components/tracking-line"
import StatusDot from "@modules/account/components/status-dot"

/**
 * The order's one stage (t-2026-10-14-58, step C) on every surface a buyer
 * reads it: the order page and the account's order page wear the block (a
 * sentence, what happens next, the bar of this order's steps and the tracking
 * number), the account lists wear the dot, and the old confirmation template
 * the badge. All three read `orderStage` and the `OrderStage` catalog, so an
 * order never says one thing in one place and another elsewhere. The panel says
 * the same words for the owner.
 */

const asStageOrder = (order: HttpTypes.StoreOrder) => order as unknown as StageOrder

const BADGE_COLORS: Record<StatusTone, "green" | "red" | "blue" | "orange" | "grey" | "purple"> = {
  green: "green",
  red: "red",
  orange: "orange",
  blue: "blue",
  purple: "purple",
  neutral: "grey",
}

type BlockProps = {
  order: HttpTypes.StoreOrder
  /** `h1` on the order page, `h2` under the account page's «Заказ №…» heading. */
  level?: "h1" | "h2"
  /** Replaces the stage's own sentence: Robokassa's self-refreshing «waiting for confirmation». */
  hint?: ReactNode
  /** Under the sentence: the course button. */
  children?: ReactNode
}

export const OrderStageBlock = async ({ order, level = "h1", hint, children }: BlockProps) => {
  const t = await getTranslations("OrderStage")
  const tTimeline = await getTranslations("OrderTimeline")
  const tCopy = await getTranslations("ManualPayment")

  const stageOrder = asStageOrder(order)
  const stage = orderStage(stageOrder)
  const progress = orderDelivery(stageOrder).kind === "course" ? null : orderStageProgress(stageOrder)
  const tracking = trackingEntries(order.fulfillments)

  return (
    <div className="flex flex-col gap-y-3" data-testid="order-stage" data-value={stage}>
      <Heading
        level={level}
        className={level === "h1" ? "text-2xl-semi text-ui-fg-base" : "text-xl-semi text-ui-fg-base"}
        data-testid="order-stage-title"
      >
        {t(`title.${stage}`)}
      </Heading>

      {hint ?? (
        <Text className="txt-medium text-ui-fg-subtle" data-testid="order-stage-hint">
          {t(`hint.${orderStageHint(stageOrder)}`)}
        </Text>
      )}

      {children}

      {progress ? (
        <div className="flex flex-col gap-y-2 mt-1" data-testid="order-stage-bar" data-value={`${progress.at}/${progress.total}`}>
          <div className="flex gap-x-1" aria-hidden="true">
            {Array.from({ length: progress.total }, (_, index) => (
              <span
                key={index}
                className={clx("h-1.5 flex-1 rounded-full", {
                  "bg-ui-fg-base": index + 1 < progress.at || progress.at === progress.total,
                  "bg-ui-fg-interactive": index + 1 === progress.at && progress.at < progress.total,
                  "bg-ui-border-base": index + 1 > progress.at,
                })}
              />
            ))}
          </div>
          <div className="flex justify-between gap-x-3 txt-compact-small text-ui-fg-subtle">
            <span>
              {progress.next
                ? t.rich("next", {
                    stage: t(`label.${progress.next}`),
                    b: (chunks) => <span className="text-ui-fg-base">{chunks}</span>,
                  })
                : t("allDone")}
            </span>
            <span className="tabular-nums shrink-0">{t("step", { at: progress.at, total: progress.total })}</span>
          </div>
        </div>
      ) : (
        stage !== "accessOpen" && (
          <StatusDot tone={ORDER_STAGE_TONES[stage]} label={t(`label.${stage}`)} />
        )
      )}

      {tracking.length > 0 && (
        <div
          className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-subtle px-4 py-3"
          data-testid="order-tracking"
        >
          {tracking.map((entry) => (
            <span key={entry.line} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="txt-compact-small text-ui-fg-subtle">{tTimeline("trackingNumber")}</span>
              <TrackingLine
                display={trackingDisplay(entry)}
                number={entry.number}
                url={entry.url}
                labels={{ copy: tCopy("copy"), copied: tCopy("copied"), track: tTimeline("trackLink") }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

type MarkProps = { order: HttpTypes.StoreOrder; className?: string }

/** The account lists: the 8 px dot and the stage's word. */
export const OrderStageDot = async ({ order, className }: MarkProps) => {
  const t = await getTranslations("OrderStage")
  const stage = orderStage(asStageOrder(order))
  return (
    <StatusDot
      tone={ORDER_STAGE_TONES[stage]}
      label={t(`label.${stage}`)}
      className={className}
      data-testid="order-stage"
      data-value={stage}
    />
  )
}

/** The pill, where a template still draws statuses as badges. */
export const OrderStageBadge = async ({ order, className }: MarkProps) => {
  const t = await getTranslations("OrderStage")
  const stage = orderStage(asStageOrder(order))
  return (
    <StatusBadge
      color={BADGE_COLORS[ORDER_STAGE_TONES[stage]]}
      className={className}
      data-testid="order-stage"
      data-value={stage}
    >
      {t(`label.${stage}`)}
    </StatusBadge>
  )
}

/** One line for a list card: the first tracking number and its page. */
export const OrderStageTracking = async ({ order, className }: MarkProps) => {
  const entry = trackingEntries(order.fulfillments)[0]
  if (!entry) return null
  const t = await getTranslations("OrderTimeline")
  return (
    <span className={clx("txt-small text-ui-fg-subtle", className)} data-testid="order-tracking">
      {t("trackingNumber")} <span className="tabular-nums">{trackingDisplay(entry)}</span>
      {entry.url && (
        <>
          {" · "}
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="txt-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            data-testid="order-tracking-link"
          >
            {t("trackLink")}
          </a>
        </>
      )}
    </span>
  )
}
