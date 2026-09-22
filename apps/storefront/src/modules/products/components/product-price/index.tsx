"use client"

import { getProductPrice } from "@lib/util/get-product-price"
import type { HttpTypes } from "@medusajs/types"
import Wallet from "@modules/common/icons/wallet"
import { useLocale, useTranslations } from "next-intl"

/**
 * The price line of the buy box: a wallet mark, the price, and, on a sale, the
 * original price struck through at the other end of the line — the top row of the buy
 * card in Ivan's Figma mockup. The discount is kept on the struck price as a data
 * attribute and for assistive technology; the two prices side by side say it already.
 */
export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
}) {
  const locale = useLocale()
  const t = useTranslations("ProductPrice")
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
    locale,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return (
      <div className="block h-8 w-32 animate-pulse rounded-rounded bg-ui-bg-component" />
    )
  }

  const onSale = selectedPrice.price_type === "sale"

  return (
    <div
      className="flex items-center justify-between gap-x-3"
      data-testid="product-price-row"
    >
      <span className="inline-flex min-w-0 items-center gap-x-2 text-2xl font-semibold leading-8 tabular-nums text-ui-fg-base">
        <Wallet className="shrink-0 text-ui-fg-interactive" aria-hidden />
        {!variant && (
          <span className="text-base font-normal text-ui-fg-subtle">
            {t("from")}
          </span>
        )}
        <span
          data-testid="product-price"
          data-value={selectedPrice.calculated_price_number}
        >
          {selectedPrice.calculated_price}
        </span>
      </span>
      {onSale && (
        <span
          className="shrink-0 text-sm leading-5 tabular-nums text-ui-fg-muted line-through"
          data-testid="original-product-price"
          data-value={selectedPrice.original_price_number}
          data-discount={selectedPrice.percentage_diff}
        >
          {selectedPrice.original_price}
        </span>
      )}
    </div>
  )
}
