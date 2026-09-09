import MapPin from "@modules/common/icons/map-pin"
import { getTranslations } from "next-intl/server"

interface CheckoutPickupSummaryProps {
  name: string
  address: string
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
 */
export default async function CheckoutPickupSummary({
  name,
  address,
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
            {t("label")}
          </span>
          <span
            className="txt-compact-medium-plus text-ui-fg-base"
            data-testid="checkout-summary-pickup-point"
          >
            {name}
          </span>
          <span className="txt-compact-small text-ui-fg-subtle">
            {address}
          </span>
        </div>
      </div>
    </div>
  )
}
