"use client"

import { convertToLocale } from "@lib/util/money"
import type React from "react"
import { useLocale, useTranslations } from "next-intl"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
  }
  /**
   * Batch 6 (hotfix Plan B): `false` for a cart or order with nothing to post (an online
   * course alone) — the «Доставка» row is not shown at all, not shown as 0.
   */
  needsShipping?: boolean
  /**
   * Batch 6 part 1: `false` while the cart has no delivery method yet. The row then says
   * the price comes at checkout instead of «Доставка 0,00 ₽», which read as free delivery.
   */
  shippingChosen?: boolean
  /** Extra classes for the column of rows above the total, such as a row gap. */
  rowsClassName?: string
}

const CartTotals: React.FC<CartTotalsProps> = ({
  totals,
  needsShipping = true,
  shippingChosen = true,
  rowsClassName = "",
}) => {
  const t = useTranslations("CartTotals")
  const locale = useLocale()
  const {
    currency_code,
    total,
    tax_total,
    item_subtotal,
    shipping_subtotal,
    discount_subtotal,
  } = totals

  // t-2026-10-04-19 N5, t-2026-10-20-61 D7: the subtotal reads plain «Промежуточный итог»
  // (no parenthesis about what it leaves out), and the taxes row shows only when there is
  // a tax, never as «Налоги 0,00 ₽».
  const showTaxes = !!tax_total

  return (
    <div>
      <div className={`flex flex-col txt-medium text-ui-fg-subtle ${rowsClassName}`}>
        <div className="flex items-center justify-between gap-x-4">
          <span>{t("subtotalNothingToShip")}</span>
          <span data-testid="cart-subtotal" data-value={item_subtotal || 0}>
            {convertToLocale({ amount: item_subtotal ?? 0, currency_code, locale })}
          </span>
        </div>
        {needsShipping && (
          <div className="flex items-center justify-between gap-x-4">
            <span>{t("shipping")}</span>
            {shippingChosen ? (
              <span data-testid="cart-shipping" data-value={shipping_subtotal || 0}>
                {convertToLocale({ amount: shipping_subtotal ?? 0, currency_code, locale })}
              </span>
            ) : (
              <span className="text-ui-fg-muted" data-testid="cart-shipping" data-pending="true">
                {t("shippingAtCheckout")}
              </span>
            )}
          </div>
        )}
        {!!discount_subtotal && (
          <div className="flex items-center justify-between gap-x-4">
            <span>{t("discount")}</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-discount"
              data-value={discount_subtotal || 0}
            >
              -{" "}
              {convertToLocale({
                amount: discount_subtotal ?? 0,
                currency_code,
                locale,
              })}
            </span>
          </div>
        )}
        {showTaxes && (
          <div className="flex justify-between gap-x-4">
            <span className="flex gap-x-1 items-center ">{t("taxes")}</span>
            <span data-testid="cart-taxes" data-value={tax_total || 0}>
              {convertToLocale({ amount: tax_total ?? 0, currency_code, locale })}
            </span>
          </div>
        )}
      </div>
      <div className="h-px w-full border-b border-ui-border-base my-3" />
      <div className="flex items-center justify-between gap-x-4 text-ui-fg-base txt-medium ">
        <span>{t("total")}</span>
        <span
          className="txt-xlarge-plus"
          data-testid="cart-total"
          data-value={total || 0}
        >
          {convertToLocale({ amount: total ?? 0, currency_code, locale })}
        </span>
      </div>
    </div>
  )
}

export default CartTotals
