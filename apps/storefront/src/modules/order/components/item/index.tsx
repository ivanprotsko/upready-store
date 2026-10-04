import type { HttpTypes } from "@medusajs/types"
import { Badge, Text } from "@medusajs/ui"

import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LineItemUnitPrice from "@modules/common/components/line-item-unit-price"
import Thumbnail from "@modules/products/components/thumbnail"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  currencyCode: string
  /** Batch 7: the translated «онлайн-курс» badge for a no-delivery line, null for a posted one. */
  noDeliveryLabel?: string | null
}

/**
 * One line of the order. It used to be a table row, which came with a hover
 * highlight and a trailing border that promised a link the row never had, plus
 * cell padding that pushed it out of line with every other section on the page.
 *
 * The variant line only when it says something the title does not (batch 7, the
 * same rule as the cart and the checkout): a single-variant product used to print
 * «Вариант: Набор…» right under «Набор…».
 */
const Item = ({ item, currencyCode, noDeliveryLabel = null }: ItemProps) => {
  const variantTitle =
    item.variant?.title &&
    item.variant.title.trim().toLowerCase() !== (item.product_title ?? "").trim().toLowerCase()
      ? item.variant.title
      : null

  return (
    <li
      className="flex items-center gap-x-4 py-4 first:pt-0 last:pb-0"
      data-testid="product-row"
    >
      <div className="w-16 shrink-0">
        <Thumbnail
          thumbnail={item.thumbnail}
          alt={item.product_title ?? item.title ?? ""}
          size="square"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-y-1">
        <Text
          className="txt-medium-plus text-ui-fg-base"
          data-testid="product-name"
        >
          {item.product_title}
        </Text>
        {noDeliveryLabel ? (
          <Badge size="xsmall" color="blue" className="w-fit" data-testid="line-no-delivery-badge">
            {noDeliveryLabel}
          </Badge>
        ) : variantTitle ? (
          <LineItemOptions variant={item.variant} data-testid="product-variant" />
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="flex gap-x-1">
          <Text className="text-ui-fg-muted">
            <span data-testid="product-quantity">{item.quantity}</span>x{" "}
          </Text>
          <LineItemUnitPrice
            item={item}
            style="tight"
            currencyCode={currencyCode}
          />
        </span>

        <LineItemPrice item={item} style="tight" currencyCode={currencyCode} />
      </div>
    </li>
  )
}

export default Item
