"use client"

import { useTranslations } from "next-intl"

import { useProductSelection } from "@modules/products/components/product-selection"

/**
 * The one way into the «Характеристики и описание» drawer: a bold text button at the
 * bottom of the product card, under the description excerpt, as on Wildberries
 * (Ivan: «мы оставим одну кнопку»). It replaced the «Все характеристики» and
 * «Всё описание» links; the drawer returns focus here when it closes.
 *
 * The translucent plate behind the label is a fixed-size layer (Ivan, 2026-09-24:
 * «overlay с полупрозрачной "пленкой" не изменял свой размер и позицию, а просто
 * становился менее прозрачным при наведении»): hover only raises its opacity, the
 * button itself never resizes, moves or grows an outline. Keyboard focus still gets
 * the ring through `:focus-visible`.
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
      className="group relative w-fit rounded-md text-left text-sm font-semibold leading-6 text-ui-fg-base outline-none focus-visible:shadow-borders-focus"
      data-testid="product-details-opener"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-md bg-ui-fg-base opacity-[0.06] transition-opacity duration-150 group-hover:opacity-[0.12]"
      />
      <span className="relative block px-4 py-2">{t("details")}</span>
    </button>
  )
}
