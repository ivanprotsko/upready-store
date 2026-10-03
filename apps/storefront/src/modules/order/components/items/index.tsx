import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"

import repeat from "@lib/util/repeat"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import { shipmentGroups } from "@lib/util/shipment-groups"
import Item from "@modules/order/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsProps = {
  order: HttpTypes.StoreOrder
  /** Batch 7: once the payment is captured the course group header says the access is open. */
  paid?: boolean
}

/**
 * The order's lines grouped by shipment (batch 6): «Отправление № N» for what is
 * posted, the online course in its own group without a number — the same
 * `shipmentGroups` the cart sidebar and the checkout read, over the order's own
 * items, so the numbers the buyer saw before paying are the numbers here.
 */
const Items = async ({ order, paid = false }: ItemsProps) => {
  const tShip = await getTranslations("Shipments")
  const items = order.items

  if (!items?.length) {
    return (
      <ul className="flex flex-col divide-y divide-ui-border-base" data-testid="products-table">
        {repeat(5).map((i) => (
          <SkeletonLineItem key={i} />
        ))}
      </ul>
    )
  }

  const sorted = [...items].sort((a, b) => ((a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1))
  const groups = shipmentGroups(
    sorted.map((item) => ({ id: item.id, digital: isNoDeliveryLine(item), item }))
  )
  const showGroupHeaders = groups.length > 1 || groups.some((group) => group.kind === "digital")
  const noDeliveryLabel = tShip("noDeliveryBadge")

  return (
    <div className="flex flex-col gap-y-6" data-testid="products-table">
      {groups.map((group) => (
        <div
          key={group.key}
          data-testid={`shipment-group-${group.kind}`}
          data-shipment-no={group.no ?? undefined}
        >
          {showGroupHeaders && (
            <p className="txt-compact-small-plus text-ui-fg-subtle mb-2">
              {group.kind === "physical"
                ? tShip("shipmentNo", { no: group.no ?? 1 })
                : paid
                  ? tShip("digitalGroupPaid")
                  : tShip("digitalGroup")}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-ui-border-base">
            {group.lines.map(({ item }) => (
              <Item
                key={item.id}
                item={item}
                currencyCode={order.currency_code}
                noDeliveryLabel={isNoDeliveryLine(item) ? noDeliveryLabel : null}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default Items
