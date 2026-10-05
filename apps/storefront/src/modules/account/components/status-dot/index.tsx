import { clx } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import {
  FULFILLMENT_TONES,
  PAYMENT_TONES,
  type StatusTone,
} from "@lib/util/order-status"

/**
 * The workspace canon's "status = 8 px dot + text, not a giant badge"
 * (`~/upready/packages/geist-kit/AGENTS.md`), built on this storefront's own
 * `@medusajs/ui` tag-color tokens rather than a raw hex — the same tokens
 * `checkout-shipping-section/index.tsx:358` already reads
 * (`text-status-success`). Replaces `OrderStatusBadge`'s `StatusBadge` pill
 * on every account surface (`OrderCard`, order details, the timeline's
 * canceled line) per the account mockup's own fork resolution (D3 Open forks,
 * "a shared `<StatusDot>` reusing the same color table").
 */

export type { StatusTone }

const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  green: "bg-status-success",
  red: "bg-status-error",
  orange: "bg-status-warning-text",
  blue: "bg-ui-tag-blue-icon",
  purple: "bg-ui-tag-purple-icon",
  neutral: "bg-ui-tag-neutral-icon",
}

type StatusDotProps = {
  tone: StatusTone
  label: string
  className?: string
  "data-testid"?: string
  "data-value"?: string
}

/** The primitive: an 8 px filled circle plus its sentence-case label. */
const StatusDot = ({
  tone,
  label,
  className,
  "data-testid": testId,
  "data-value": dataValue,
}: StatusDotProps) => (
  <span
    className={clx("inline-flex items-center gap-x-2", className)}
    data-testid={testId}
    data-value={dataValue}
  >
    <span
      className={clx("h-2 w-2 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
      aria-hidden="true"
    />
    <span className="txt-compact-small text-ui-fg-subtle">{label}</span>
  </span>
)

export default StatusDot

type OrderStatusDotProps = {
  kind: "fulfillment" | "payment"
  status?: string | null
  className?: string
}

/**
 * Reads a raw `fulfillment_status`/`payment_status` enum through
 * `OrderDetails.fulfillmentStatuses`/`paymentStatuses` (never the enum itself on
 * screen, per the workspace UI canon) and renders it as a `StatusDot`. Async
 * because it is a server component, the way every other order-detail piece here is.
 */
export const OrderStatusDot = async ({
  kind,
  status,
  className,
}: OrderStatusDotProps) => {
  if (!status) {
    return null
  }

  const t = await getTranslations("OrderDetails")
  const group = kind === "payment" ? "paymentStatuses" : "fulfillmentStatuses"
  const tones = kind === "payment" ? PAYMENT_TONES : FULFILLMENT_TONES

  // A future Medusa release can add a status this catalog has never heard of,
  // and a raw message key is not something to show a customer.
  const key = `${group}.${status}`
  const label = t.has(key) ? t(key) : status.replaceAll("_", " ")

  return (
    <StatusDot
      tone={tones[status] ?? "neutral"}
      label={label}
      className={className}
      data-testid={`order-${kind}-status`}
      data-value={status}
    />
  )
}
