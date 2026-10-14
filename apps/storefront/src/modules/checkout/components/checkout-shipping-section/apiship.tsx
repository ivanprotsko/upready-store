"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { HttpTypes } from "@medusajs/types"

import { setShippingMethod } from "@lib/data/cart"
import {
  apishipMethodOf,
  apishipNeedsPoint,
  apishipPointLine,
  apishipProviderKeyOf,
  cityForApishipSearch,
  isApishipOption,
  type ApishipStorePoint,
} from "@lib/util/apiship"
import { convertToLocale } from "@lib/util/money"
import { useErrorMessage } from "@lib/util/use-error-message"
import CheckoutApishipPointSheet from "@modules/checkout/components/checkout-apiship-point-sheet"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"

type ShippingOption = HttpTypes.StoreCartShippingOptionWithServiceZone

/**
 * The ApiShip half of «Способ доставки» (t-2026-10-14-58, part B), kept out of the
 * section's `index.tsx`, which is already a thousand lines. The section asks this
 * hook at each place a carrier differs: what a click opens, the price a row shows,
 * the lines under a chosen row, the folded summary and the point sheet. Every answer
 * is `null`, `false` or `undefined` for an option that is not ApiShip's, so the
 * section's own CDEK and Russian Post branches run as before.
 *
 * The shape follows CDEK's: a pickup option cannot be set without a point (the
 * provider answers 400 «Выберите пункт выдачи»), so choosing its row opens the sheet
 * and the sheet performs the `setShippingMethod`. A courier option is set at once.
 */
export function useApishipShipping({
  cart,
  options,
  listPrice,
  shippingMethodId,
  setShippingMethodId,
  setShippingError,
}: {
  cart: HttpTypes.StoreCart
  options: ShippingOption[] | null
  /** The option's price from `/calculate` without a point: the city's «от» price. */
  listPrice: (option: ShippingOption) => number | null
  shippingMethodId: string | null
  setShippingMethodId: (id: string | null) => void
  setShippingError: (error: string | null) => void
}) {
  const t = useTranslations("CheckoutPage")
  const tCdek = useTranslations("CdekPoint")
  const tApiship = useTranslations("ApishipPoint")
  const locale = useLocale()
  const getErrorMessage = useErrorMessage()
  const { trackCartUpdate } = useCartUpdate()

  const [sheetOptionId, setSheetOptionId] = useState<string | null>(null)
  const sheetOption = useMemo(
    () => (options ?? []).find((option) => option.id === sheetOptionId) ?? null,
    [options, sheetOptionId]
  )

  /** What the provider wrote on the cart's method, when that method is this option. */
  const chosenFor = (option?: ShippingOption | null) => {
    if (!isApishipOption(option)) return null
    const method = (cart.shipping_methods ?? []).find(
      (sm) => sm.shipping_option_id === option!.id
    )
    return method ? apishipMethodOf({ shipping_methods: [method] }) : null
  }

  const money = (amount: number) =>
    amount === 0
      ? t("freeShipping")
      : convertToLocale({ amount, currency_code: cart.currency_code, locale })

  /**
   * True when the click is the sheet's to handle. The section returns at once and
   * the sheet sets the method once the buyer has picked a point.
   */
  const opensSheet = (option?: ShippingOption | null): boolean => {
    if (!apishipNeedsPoint(option)) return false
    setSheetOptionId(option!.id)
    return true
  }

  /** The step is done for an ApiShip pickup option only once its point is on the cart. */
  const isComplete = (option?: ShippingOption | null): boolean =>
    !apishipNeedsPoint(option) || chosenFor(option)?.pointId != null

  /**
   * The exact amount once a point is chosen: the provider priced the method with
   * the point, and the city's «от» price would now be a second, different number.
   */
  const methodAmount = (option: ShippingOption): number | undefined => {
    if (!apishipNeedsPoint(option) || chosenFor(option)?.pointId == null) return undefined
    const amount = (cart.shipping_methods ?? []).find(
      (sm) => sm.shipping_option_id === option.id
    )?.amount
    return typeof amount === "number" ? amount : undefined
  }

  /** «от 350 ₽» for a pickup option still priced for the city alone; any other price as it is. */
  const priceText = (option: ShippingOption, formatted: string): string =>
    apishipNeedsPoint(option) && methodAmount(option) === undefined
      ? t("deliveryWayFrom", { price: formatted })
      : formatted

  /**
   * The words in place of a price the carrier refused for the address
   * (`apiship_address_rejected`). ApiShip's СДЭК reads as the direct СДЭК does;
   * any other carrier gets the same sentence without a carrier's name.
   */
  const addressRejectedText = (option: ShippingOption): string | null =>
    !isApishipOption(option)
      ? null
      : apishipProviderKeyOf(option) === "cdek"
        ? t("shippingPriceAddressRejected")
        : tApiship("addressRejected")

  const termOf = (option?: ShippingOption | null): string | null => {
    const chosen = chosenFor(option)
    return chosen ? [chosen.termLabel, chosen.tariffName].filter(Boolean).join(" · ") || null : null
  }

  const summaryPoint = (option?: ShippingOption | null): string | null =>
    apishipNeedsPoint(option) ? apishipPointLine(chosenFor(option)) : null

  /** The part of the section's fold key that changes with the point picked. */
  const completionPart = (option?: ShippingOption | null): string => {
    const pointId = apishipNeedsPoint(option) ? chosenFor(option)?.pointId : null
    return pointId == null ? "" : String(pointId)
  }

  /** The point, the term and «Сменить пункт» under the chosen row, as CDEK's row prints them. */
  const rowLines = (option: ShippingOption, isSelected: boolean): ReactNode => {
    if (!isSelected || !isApishipOption(option)) return null
    const point = summaryPoint(option)
    const term = termOf(option)
    return (
      <>
        {point && (
          <span className="txt-compact-small text-ui-fg-base" data-testid="delivery-option-apiship-point">
            {point}
          </span>
        )}
        {term && (
          <span className="txt-compact-small text-ui-fg-subtle" data-testid="delivery-option-apiship-term">
            {term}
          </span>
        )}
        {apishipNeedsPoint(option) && (
          <button
            type="button"
            onClick={() => setSheetOptionId(option.id)}
            className="relative z-20 w-fit txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm"
            data-testid="delivery-option-apiship-change"
          >
            {tCdek("change")}
          </button>
        )}
      </>
    )
  }

  /**
   * Sets the ApiShip method with the point the buyer picked. Returns the error
   * message for the sheet to show («Выберите пункт выдачи», «Этот пункт выдачи
   * больше не принимает посылки: выберите другой»), or `null`: the sheet stays open
   * on a failure, because closing it would leave the cart on the previous method
   * with no sign of what went wrong.
   */
  const choosePoint = async (point: ApishipStorePoint): Promise<string | null> => {
    if (!sheetOptionId) return null
    setShippingError(null)
    const prev = shippingMethodId
    setShippingMethodId(sheetOptionId)
    const err = await trackCartUpdate(() =>
      setShippingMethod({
        cartId: cart.id,
        shippingMethodId: sheetOptionId,
        data: { apiship_point_id: point.id },
      })
    ).catch((e: Error) => e.message)
    if (err) {
      setShippingMethodId(prev)
      return getErrorMessage(err as string)
    }
    return null
  }

  const sheetPrice = sheetOption ? listPrice(sheetOption) : null
  const sheet = sheetOption ? (
    <CheckoutApishipPointSheet
      open
      onClose={() => setSheetOptionId(null)}
      providerKey={apishipProviderKeyOf(sheetOption) ?? ""}
      initialCity={cityForApishipSearch(cart)}
      selectedId={chosenFor(sheetOption)?.pointId ?? null}
      onChoose={choosePoint}
      methodPrice={
        sheetPrice === null
          ? null
          : sheetPrice === 0
            ? t("freeShipping")
            : t("deliveryWayFrom", { price: money(sheetPrice) })
      }
    />
  ) : null

  return {
    opensSheet,
    isComplete,
    methodAmount,
    priceText,
    addressRejectedText,
    rowLines,
    summaryPoint,
    summaryTerm: termOf,
    completionPart,
    sheetOpen: !!sheetOptionId,
    sheet,
  }
}
