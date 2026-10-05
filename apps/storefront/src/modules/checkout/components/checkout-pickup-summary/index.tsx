import MapPin from "@modules/common/icons/map-pin"
import { getTranslations } from "next-intl/server"

interface CheckoutPickupSummaryProps {
  /** The line above the name; «Пункт выдачи» when not given. */
  label?: string
  name: string
  address: string
  /** More lines under the address: a carrier's point, its delivery term. */
  details?: string[]
  testId?: string
}

/**
 * D2 frame 4, right column: the chosen pickup point echoed between
 * `CheckoutTotals` and `DiscountCode` — "the order summary column" item 1
 * asks for. Shown only when `cart.metadata.pickup_point_id` is set
 * (`checkout-summary/index.tsx`); a pure read of `cart.metadata`, so unlike
 * the left column's row (`checkout-info-rows`) this one is not a button —
 * reopening the sheet is already reachable from the left column, and a
 * second live control here would duplicate that state with no context of
 * its own (`checkout-summary` renders outside `PickupSheetProvider`).
 *
 * D10 (t-2026-10-04-19) shows a carrier's tariff the same way: «Доставка»,
 * the tariff, the CDEK or Russian Post point and the term.
 */
export default async function CheckoutPickupSummary({
  label,
  name,
  address,
  details = [],
  testId = "checkout-summary-pickup-point",
}: CheckoutPickupSummaryProps) {
  const t = await getTranslations("PickupPoint")

  return (
    <div className="flex flex-col gap-y-2">
      <div className="h-px bg-ui-border-base" />
      <div className="flex items-start gap-x-2">
        <span className="flex-shrink-0 text-ui-fg-base mt-0.5">
          <MapPin size={20} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="txt-compact-small text-ui-fg-muted">
            {label ?? t("label")}
          </span>
          <span
            className="txt-compact-medium-plus text-ui-fg-base"
            data-testid={testId}
          >
            {name}
          </span>
          {address && (
            <span className="txt-compact-small text-ui-fg-subtle">
              {address}
            </span>
          )}
          {details.map((line) => (
            <span key={line} className="txt-compact-small text-ui-fg-subtle">
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
