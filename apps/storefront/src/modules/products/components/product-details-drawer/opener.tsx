"use client"

import { useTranslations } from "next-intl"

import { useProductSelection } from "@modules/products/components/product-selection"

/**
 * The one way into the «Характеристики и описание» drawer: a bold text button at the
 * bottom of the product card, under the description excerpt, as on Wildberries
 * (Ivan: «мы оставим одну кнопку»). It replaced the «Все характеристики» and
 * «Всё описание» links; the drawer returns focus here when it closes.
 */
export default function ProductDetailsOpener() {
  const t = useTranslations("ProductInfo")
  const { setDetailsOpen, detailsOpenerRef } = useProductSelection()

  return (
    <button
      ref={detailsOpenerRef}
      type="button"
      onClick={() => setDetailsOpen(true)}
      aria-haspopup="dialog"
      className="w-fit text-left text-sm font-semibold leading-6 text-ui-fg-base underline-offset-4 hover:underline focus-visible:shadow-borders-focus rounded-sm outline-none"
      data-testid="product-details-opener"
    >
      {t("details")}
    </button>
  )
}
