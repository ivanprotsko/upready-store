import { clx } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

/**
 * The workspace canon's "status = 8 px dot + text, not a giant badge"
 * (`~/upready/packages/geist-kit/AGENTS.md`), built on this storefront's own
 * `@medusajs/ui` tag-color tokens rather than a raw hex — the same tokens
 * `checkout-shipping-section/index.tsx:358` already reads
 * (`text-ui-tag-green-icon`). Replaces `OrderStatusBadge`'s `StatusBadge` pill
 * on every account surface (`OrderCard`, order details, the timeline's
 * canceled line) per the account mockup's own fork resolution (D3 Open forks,
 * "a shared `<StatusDot>` reusing the same color table").
 */

export type StatusTone = "green" | "red" | "orange" | "blue" | "purple" | "neutral"

const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  green: "bg-ui-tag-green-icon",
  red: "bg-ui-tag-red-icon",
  orange: "bg-ui-tag-orange-icon",
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

/**
 * Mirrors how the Medusa Admin colors the same statuses (`order-status/index.tsx`'s
 * own comment), so a shop owner reads an order the same way on both sides: neutral
 * for nothing done yet, orange for part way through, blue for on its way, green for
 * finished and red for something that needs attention.
 */
const FULFILLMENT_TONES: Record<string, StatusTone> = {
  canceled: "red",
  delivered: "green",
  fulfilled: "blue",
  not_fulfilled: "neutral",
  partially_delivered: "orange",
  partially_fulfilled: "orange",
  partially_shipped: "orange",
  shipped: "blue",
}

const PAYMENT_TONES: Record<string, StatusTone> = {
  authorized: "orange",
  awaiting: "orange",
  canceled: "red",
  captured: "green",
  not_paid: "neutral",
  partially_authorized: "orange",
  partially_captured: "orange",
  partially_refunded: "orange",
  refunded: "neutral",
  requires_action: "red",
}

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
