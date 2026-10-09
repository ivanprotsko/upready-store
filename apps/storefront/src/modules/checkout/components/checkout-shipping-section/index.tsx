"use client"

import { useState, useEffect, useRef, useTransition, useMemo } from "react"
import { setShippingMethod, updateRegion } from "@lib/data/cart"
import {
  calculatePriceForShippingOption,
  quoteShippingMethod,
} from "@lib/data/fulfillment"
import { TARIFF_PROVIDER_ID } from "@lib/util/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { getDeliveryDays, isPickupShippingOption } from "@lib/util/fulfillment"
import { isShippingCardUnpriced } from "@lib/util/shipping-card"
import { shippingOptionText } from "@lib/util/shipping-option-text"
import {
  cdekKindOf,
  cdekNeedsPoint,
  chosenCdekPoint,
  cdekTermOf,
  cityForPointSearch,
  isCdekOption,
  type CdekStorePoint,
} from "@lib/util/cdek"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import { usePickupSheet } from "@modules/checkout/context/pickup-sheet-context"
import CheckoutCdekPointSheet from "@modules/checkout/components/checkout-cdek-point-sheet"
import CheckoutPochtaPointSheet from "@modules/checkout/components/checkout-pochta-point-sheet"
import {
  chosenPochtaPoint,
  cityForPochtaSearch,
  isPochtaOption,
  type PochtaStorePoint,
} from "@lib/util/pochta"
import { Loader, CursorDefault, CheckMini } from "@medusajs/icons"
import { Button, DropdownMenu, RadioGroup, clx } from "@medusajs/ui"
import Truck from "@modules/common/icons/truck"
import type { HttpTypes } from "@medusajs/types"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useErrorMessage } from "@lib/util/use-error-message"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import { isShippingStepDone } from "@lib/util/checkout-steps"

type CountryOption = {
  country: string
  region: string
  label: string
}

/**
 * Every pickup point is its own shipping option (`seedFulfillment()`'s own
 * doc comment, `apps/backend/src/migration-scripts/lib/fulfillment.ts`), but
 * the mockup draws exactly one "Pickup" card (D2 frame 1) — this
 * `RadioGroup.Item` value stands for the whole group of them, never a real
 * option id. Selecting it opens the point sheet (`usePickupSheet`), which
 * is the only place a REAL pickup option id is ever sent to
 * `setShippingMethod` (`pickup-sheet-context.tsx`'s `choosePoint`).
 */
const PICKUP_GROUP_VALUE = "__pickup__"

type ShippingOption = HttpTypes.StoreCartShippingOptionWithServiceZone
type ShippingRow = { kind: "option"; option: ShippingOption } | { kind: "pickup" }

interface CheckoutShippingSectionProps {
  cart: HttpTypes.StoreCart
  availableShippingOptions:
  | HttpTypes.StoreCartShippingOptionWithServiceZone[]
  | null
  regions: HttpTypes.StoreRegion[]
  currentCountry: string
  /**
   * t-2026-10-09-56 (Ivan's item 7): the address section before this one is not
   * done yet, so this one shows its heading alone (`checkoutStepLocksOf`).
   */
  locked?: boolean
}

function getLocalizedCountryName(
  isoCode: string,
  locale: string,
  fallback: string
) {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(
        isoCode.toUpperCase()
      ) ?? fallback
    )
  } catch {
    return fallback
  }
}

/** `data.sort_order` of a tenant method; anything else sorts last, in API order. */
const sortOrderOf = (option: HttpTypes.StoreCartShippingOption): number => {
  const value = (option.data as { sort_order?: unknown } | null)?.sort_order
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER
}

/**
 * The name of the zone that priced this method («Урал», «Россия, вся страна»),
 * written into `data.zone.label` by the backend on every save
 * (`apps/backend/src/shipping-tariffs/ru-zone-presets.ts`). A method saved
 * before zones had names carries none, and the card simply shows no zone line.
 */
const zoneLabel = (
  option: HttpTypes.StoreCartShippingOption
): string | null => {
  const zone = (option.data as { zone?: { label?: unknown } | null } | null)?.zone
  const label = zone?.label
  return typeof label === "string" && label.trim() ? label.trim() : null
}

export default function CheckoutShippingSection({
  cart,
  availableShippingOptions,
  regions,
  currentCountry,
  locked = false,
}: CheckoutShippingSectionProps) {
  const t = useTranslations("CheckoutPage")
  const tCdek = useTranslations("CdekPoint")
  const tPochta = useTranslations("PochtaPoint")
  const dir = useLocaleDirection()
  const getErrorMessage = useErrorMessage()
  const locale = useLocale()
  const currentPath = usePathname()
  const [isPending, startTransition] = useTransition()
  const { trackCartUpdate } = useCartUpdate()
  const { openSheet: openPickupSheet } = usePickupSheet()

  const [isLoadingPrices, setIsLoadingPrices] = useState(true)
  const [calculatedPricesMap, setCalculatedPricesMap] = useState<
    Record<string, number>
  >({})
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null
  )
  /**
   * t-2026-10-09-56 (Ivan's item 10): once the method, and its point where it needs
   * one, is chosen, the section folds into one summary row with «Изменить», the
   * way «Адрес доставки» does. A page opened on a finished choice starts folded.
   */
  const [collapsed, setCollapsed] = useState(() =>
    isShippingStepDone(cart, availableShippingOptions)
  )
  /**
   * The CDEK method whose point sheet is open, and the point already on the
   * cart (i02-apiship-cdek-shipping). A CDEK pickup option cannot be set as the
   * shipping method without a point code — the provider rejects it — so
   * choosing its card opens the sheet and the sheet performs the
   * `setShippingMethod`, the same shape the shop's own pickup card uses.
   */
  const [cdekSheetOptionId, setCdekSheetOptionId] = useState<string | null>(null)
  const cdekChosen = chosenCdekPoint(cart)
  const cdekTerm = cdekTermOf(cart)

  /**
   * The Russian Post method whose point sheet is open, and the point already on
   * the cart (46df-pochta). Same shape as CDEK's: the provider refuses the
   * method without a point, so the sheet performs the `setShippingMethod`.
   */
  const [pochtaSheetOptionId, setPochtaSheetOptionId] = useState<string | null>(null)
  const pochtaChosen = chosenPochtaPoint(cart)

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])

  const getDeliveryDate = (daysFromNow: number) => {
    const date = new Date(now!)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + daysFromNow)
    return date
  }

  const deliveryDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
      }),
    [locale]
  )

  const formatDeliveryDate = (daysFromNow: number) => {
    return deliveryDateFormatter.format(getDeliveryDate(daysFromNow))
  }

  const formatDeliveryRange = (minDaysFromNow: number, maxDaysFromNow: number) => {
    const startDate = getDeliveryDate(minDaysFromNow)
    const endDate = getDeliveryDate(maxDaysFromNow)

    if (typeof deliveryDateFormatter.formatRange === "function") {
      return deliveryDateFormatter.formatRange(startDate, endDate)
    }

    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(startDate) + ` – ${formatDeliveryDate(maxDaysFromNow)}`
  }

  const countryOptions = useMemo<CountryOption[]>(() => {
    return regions
      .flatMap((r) =>
        (r.countries ?? []).map((c) => ({
          country: c.iso_2 ?? "",
          region: r.id,
          label: getLocalizedCountryName(
            c.iso_2 ?? "",
            locale,
            c.display_name ?? ""
          ),
        }))
      )
      .filter((o) => o.country)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [regions, locale])

  const selectedCountryOption =
    countryOptions.find((o) => o.country === currentCountry) ??
    countryOptions[0]

  const handleRegionChange = (countryCode: string) => {
    const option = countryOptions.find((opt) => opt.country === countryCode)
    if (!option) {
      return
    }

    startTransition(() => {
      updateRegion(option.country, currentPath)
    })
  }

  const shippingOptions = availableShippingOptions

  // 04.10 demo QA round 4 (devops 22k): a calculated price (СДЭК, Почта, the tenant
  // tariff) is quoted to the buyer's city and postcode. Until the address is saved
  // nothing is asked, and such a card shows no price rather than spinning on quotes
  // that cannot answer (t-2026-10-09-56 took its «Укажите адрес» line away).
  const quoteAddress = cart.shipping_address
  const quoteAddressKey =
    quoteAddress?.postal_code || quoteAddress?.city
      ? [quoteAddress.country_code, quoteAddress.postal_code, quoteAddress.city].join("|")
      : null

  useEffect(() => {
    setIsLoadingPrices(true)
    if (!shippingOptions?.length) {
      setIsLoadingPrices(false)
      return
    }

    const calculatedMethods = shippingOptions.filter(
      (sm) => sm.price_type === "calculated"
    )

    if (!calculatedMethods.length || !quoteAddressKey) {
      setCalculatedPricesMap({})
      setIsLoadingPrices(false)
      return
    }

    // A tenant tariff method is priced by the quote route; every other
    // calculated option by Medusa's own `/calculate`. Both run on the backend.
    // The quote's explanation line («0,5 кг × $11 + $44») is not shown: the
    // buyer sees the price alone (t-2026-10-04-22, f03).
    Promise.allSettled(
      calculatedMethods.map(async (sm) => {
        if (sm.provider_id === TARIFF_PROVIDER_ID) {
          const quote = await quoteShippingMethod(sm.id, cart.id)
          return quote
            ? { id: sm.id, amount: quote.amount }
            : null
        }
        const priced = await calculatePriceForShippingOption(sm.id, cart.id)
        return priced?.id
          ? { id: priced.id, amount: priced.amount ?? 0 }
          : null
      })
    ).then((results) => {
      const pricesMap: Record<string, number> = {}
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value?.id) {
          pricesMap[r.value.id] = r.value.amount
        }
      })
      setCalculatedPricesMap(pricesMap)
      setIsLoadingPrices(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableShippingOptions, cart.id, quoteAddressKey])

  // Never called with a pickup option's id — the pickup card's own value is
  // the sentinel `PICKUP_GROUP_VALUE` (below), handled separately by opening
  // the point sheet. `pickup-sheet-context.tsx`'s `choosePoint` is the only
  // path that ever sets a REAL pickup option as the cart's shipping method.
  const handleSelectShipping = async (id: string) => {
    setShippingError(null)
    const prev = shippingMethodId
    setShippingMethodId(id)
    const err = await trackCartUpdate(() =>
      setShippingMethod({
        cartId: cart.id,
        shippingMethodId: id,
      })
    ).catch((e: Error) => e.message)
    if (err) {
      setShippingMethodId(prev)
      setShippingError(err as string)
      // The error is printed under the list, so the list stays open to show it.
      setCollapsed(false)
    }
  }

  const cdekSheetOption = useMemo(
    () => (availableShippingOptions ?? []).find((sm) => sm.id === cdekSheetOptionId) ?? null,
    [availableShippingOptions, cdekSheetOptionId]
  )

  /**
   * The sheet's own price line: the same amount the method's card shows, so the
   * point card inside the sheet cannot quote a different number from the card
   * that opened it. `null` while the quote is still in flight — a price the
   * buyer has not been shown yet must not be invented (rule 17a).
   */
  const cdekSheetPriceLabel = useMemo(() => {
    if (!cdekSheetOption) return null
    const amount =
      cdekSheetOption.price_type === "flat"
        ? cdekSheetOption.amount ?? null
        : calculatedPricesMap[cdekSheetOption.id] ?? null
    if (amount === null) return null
    if (amount === 0) return t("freeShipping")
    return convertToLocale({
      amount,
      currency_code: cart.currency_code,
      locale,
    })
  }, [cdekSheetOption, calculatedPricesMap, cart.currency_code, locale, t])

  /**
   * Sets the CDEK method with the point the buyer picked. Returns the error
   * message for the sheet to show, or `null` — the sheet stays open on a
   * failure, because closing it would leave the cart on the previous method
   * with no sign of what went wrong.
   */
  const handleChooseCdekPoint = async (point: CdekStorePoint): Promise<string | null> => {
    if (!cdekSheetOptionId) return null
    setShippingError(null)
    const prev = shippingMethodId
    setShippingMethodId(cdekSheetOptionId)
    const err = await trackCartUpdate(() =>
      setShippingMethod({
        cartId: cart.id,
        shippingMethodId: cdekSheetOptionId,
        data: { cdek_point_code: point.code, cdek_point_name: point.name },
      })
    ).catch((e: Error) => e.message)
    if (err) {
      setShippingMethodId(prev)
      return getErrorMessage(err as string)
    }
    return null
  }

  /** Sets the Russian Post method with the point; the error goes back to the sheet. */
  const handleChoosePochtaPoint = async (point: PochtaStorePoint): Promise<string | null> => {
    if (!pochtaSheetOptionId) return null
    setShippingError(null)
    const prev = shippingMethodId
    setShippingMethodId(pochtaSheetOptionId)
    const err = await trackCartUpdate(() =>
      setShippingMethod({
        cartId: cart.id,
        shippingMethodId: pochtaSheetOptionId,
        data: {
          pochta_point_index: point.index,
          pochta_point_kind: point.kind,
          pochta_point_name: point.name,
          pochta_point_address: point.address,
        },
      })
    ).catch((e: Error) => e.message)
    if (err) {
      setShippingMethodId(prev)
      return getErrorMessage(err as string)
    }
    return null
  }

  const handleValueChange = (value: string) => {
    const option = (availableShippingOptions ?? []).find((sm) => sm.id === value)
    if (isPochtaOption(option)) {
      setPochtaSheetOptionId(value)
      return
    }
    if (cdekNeedsPoint(option)) {
      // The provider refuses a pickup method with no point, so the sheet runs
      // `setShippingMethod` once the buyer has chosen one.
      setCdekSheetOptionId(value)
      return
    }
    if (value === PICKUP_GROUP_VALUE) {
      // D2 frame 1: choosing "Pickup" opens the point sheet — whether no
      // point is chosen yet, or an already-chosen one is being changed
      // (frame 4's row does the same via `checkout-info-rows`).
      openPickupSheet()
      return
    }
    // t-2026-10-09-56 (Ivan's item 2): a method priced to the buyer's address is
    // chosen like any other, never locked for the want of one. A cart with no
    // address (a shop pickup point blanks it) gets the address form back above,
    // since the method is no longer a pickup, and the page goes to it.
    const needsAddress = option?.price_type === "calculated" && !quoteAddressKey
    handleSelectShipping(value).then(() => {
      if (needsAddress) {
        document
          .querySelector('[data-testid="checkout-address-row"]')
          ?.scrollIntoView({ block: "start", behavior: "smooth" })
      }
    })
  }

  const pickupOptions = useMemo(
    () => (shippingOptions ?? []).filter((option) => isPickupShippingOption(option)),
    [shippingOptions]
  )
  const pickupOptionIds = useMemo(
    () => new Set(pickupOptions.map((option) => option.id)),
    [pickupOptions]
  )
  // The template every pickup point's own option is priced/named the same
  // way, so the one combined card can read any of them — the seed gives
  // them all the same `name`/`code`/price (`seedFulfillment()`).
  const pickupCardOption = pickupOptions[0] ?? null

  // The owner's order from the panel's /shipping screen (`data.sort_order`);
  // options without one keep the API order after the ordered ones.
  const orderedOptions = useMemo(
    () => [...(shippingOptions ?? [])].sort((a, b) => sortOrderOf(a) - sortOrderOf(b)),
    [shippingOptions]
  )

  // Walk the fetched list in its own order, collapsing every pickup-typed
  // entry into one card at the position the FIRST one would have rendered —
  // courier/pickup/express keep the order the backend seeded them in
  // (D2 frame 1: `[Courier] [Pickup] [Express]`). Every CDEK and Russian Post
  // tariff is a row of this one list too: t-2026-10-09-56 (Ivan 09.10: «не нужно
  // делать вложенные пункты») took away the «В пункт выдачи» and «Курьером до
  // двери» cards D10 nested them in.
  const cards = useMemo(() => {
    const result: ShippingRow[] = []
    let pickupEmitted = false
    for (const option of orderedOptions) {
      if (isPickupShippingOption(option)) {
        if (!pickupEmitted) {
          result.push({ kind: "pickup" })
          pickupEmitted = true
        }
      } else {
        result.push({ kind: "option", option })
      }
    }
    return result
  }, [orderedOptions])

  // An empty string, not `undefined`, while nothing is chosen: Radix treats
  // `undefined` as an uncontrolled group and then ignores a second click on
  // the card whose point sheet the buyer closed without a point.
  const radioGroupValue = shippingMethodId && pickupOptionIds.has(shippingMethodId)
    ? PICKUP_GROUP_VALUE
    : shippingMethodId ?? ""

  // t-2026-10-01-checkout-ivan-3 #3: a method is picked, and — for the three
  // kinds the provider cannot ship without one — a point is too.
  const selectedOption =
    (availableShippingOptions ?? []).find((o) => o.id === shippingMethodId) ??
    null
  const pickupPointName =
    (cart.metadata as Record<string, string> | null)?.[PICKUP_METADATA_KEYS.name] || ""
  const hasPickupPointMeta = !!pickupPointName
  const isShippingComplete =
    !!shippingMethodId &&
    (isPickupShippingOption(selectedOption)
      ? hasPickupPointMeta
      : cdekNeedsPoint(selectedOption)
        ? !!cdekChosen
        : isPochtaOption(selectedOption)
          ? !!pochtaChosen
          : true)

  const priceOf = (option: ShippingOption, isPickupCard: boolean) => {
    // A Russian Post price depends on the point, so once the method
    // is the cart's the card shows what the cart is charged, not the
    // list quote to the buyer's own postcode (46df-pochta).
    const pochtaMethodAmount =
      isPochtaOption(option) && pochtaChosen
        ? (cart.shipping_methods ?? []).find(
            (sm) => sm.shipping_option_id === option.id
          )?.amount
        : undefined
    const priceAmount =
      typeof pochtaMethodAmount === "number"
        ? pochtaMethodAmount
        : option.price_type === "flat"
        ? option.amount!
        : calculatedPricesMap[option.id] !== undefined
          ? calculatedPricesMap[option.id]
          : null
    const isFreeShipping = priceAmount === 0
    const awaitingAddress =
      priceAmount === null && option.price_type === "calculated" && !quoteAddressKey
    // U-12 (46df): no price means the method cannot be charged, so
    // the card says why and cannot be chosen. A price that waits for the
    // address is not that: nothing was asked yet, so the card stays choosable
    // (t-2026-10-09-56, Ivan's item 2).
    const unpriced =
      !isPickupCard &&
      !awaitingAddress &&
      isShippingCardUnpriced({
        priceAmount,
        isLoadingPrices,
        pricedPerPoint: isPochtaOption(option),
      })
    // `null` draws the spinner; an empty string leaves the place empty, which is
    // what a price waiting for the address shows (Ivan 09.10: «не надо писать
    // этот текст» about «Укажите адрес — покажем цену и срок»).
    const price = isFreeShipping
      ? t("freeShipping")
      : priceAmount !== null
        ? convertToLocale({
          amount: priceAmount,
          currency_code: cart.currency_code,
          locale,
        })
        : awaitingAddress
          ? ""
          : isLoadingPrices
            ? null
            : unpriced
              ? t("shippingPriceUnavailable")
              : "—"
    return { priceAmount, isFreeShipping, awaitingAddress, unpriced, price }
  }

  const renderRow = (card: ShippingRow, isSelected: boolean) => {
    const isPickupCard = card.kind === "pickup"
    const option = isPickupCard ? pickupCardOption! : card.option
    const itemValue = isPickupCard ? PICKUP_GROUP_VALUE : option.id

    const days = getDeliveryDays(option)
    const zone = isPickupCard ? null : zoneLabel(option)
    const deliveryHint = shippingOptionText(option, "delivery_hint", locale)
    const description = shippingOptionText(option, "description", locale)
    const deliveryLabel = !days
      ? deliveryHint
      : days.max === 0
        ? t("deliveryToday")
        : !now
          ? null
          : days.min !== undefined && days.max !== undefined
            ? days.min === days.max
              ? formatDeliveryDate(days.min)
              : formatDeliveryRange(days.min, days.max)
            : days.max !== undefined
              ? t("deliveryDateUntil", {
                date: formatDeliveryDate(days.max),
              })
              : days.min !== undefined
                ? t("deliveryDateFrom", {
                  date: formatDeliveryDate(days.min),
                })
                : null

    const { isFreeShipping, unpriced, price } = priceOf(option, isPickupCard)

    return (
      <div
        key={itemValue}
        className={clx(
          "relative flex items-start gap-x-3 rounded-lg border px-4 py-3 text-start transition-colors",
          // Not selectable: a method the shop cannot charge for (U-12) must not
          // read as the chosen one. The chosen row takes the theme's accent
          // border (`border-ui-border-interactive`, the shop's own colour), not
          // Medusa's interactive shadow, which the themes leave blue (lead's
          // review of #239). t-2026-10-09-56 (Ivan: «поля и disabled элемент
          // выглядят одинаково»): the locked row has no fill at all, where it
          // used to share `bg-ui-bg-disabled` with every input of «Контакты»;
          // its border stays the ordinary one and its words go muted.
          unpriced
            ? "border-ui-border-base bg-transparent"
            : isSelected
              ? "border-ui-border-interactive bg-ui-bg-base"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover"
        )}
        data-unavailable={unpriced || undefined}
        data-testid={
          isPickupCard ? "delivery-option-pickup" : "delivery-option-radio"
        }
      >
        <RadioGroup.Item
          value={itemValue}
          aria-label={option.name}
          disabled={unpriced}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer disabled:cursor-not-allowed rounded-lg bg-transparent outline-none [&>div]:hidden focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        {/* The radio mark of `RadioGroup.ChoiceBox`, drawn here because the
            row holds buttons of its own («Изменить» for a point) and a
            radio button cannot contain them. Every row keeps it, a locked one
            in Medusa's disabled radio look (Ivan 09.10: «radio control не
            должен исчезать»). */}
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          data-testid="delivery-option-radio-mark"
          data-disabled={unpriced || undefined}
        >
          <div
            className={clx(
              "flex h-3.5 w-3.5 items-center justify-center rounded-full",
              unpriced
                ? "bg-ui-bg-disabled shadow-borders-base"
                : isSelected
                  ? "bg-ui-bg-interactive shadow-borders-interactive-with-shadow"
                  : "bg-ui-bg-base shadow-borders-base"
            )}
          >
            {isSelected && (
              <div className="h-1.5 w-1.5 rounded-full bg-ui-bg-base shadow-details-contrast-on-bg-interactive" />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-y-1">
          <div className="flex items-start justify-between gap-x-4">
            <span
              className={clx(
                "txt-compact-medium-plus",
                unpriced ? "text-ui-fg-disabled" : "text-ui-fg-base"
              )}
            >
              {option.name}
            </span>
            <span
              className={clx(
                "flex min-h-[20px] items-center",
                // The reason in place of a price is a sentence: it wraps, at
                // most half the row, rather than pushing a 390px page sideways.
                unpriced
                  ? "max-w-[50%] text-end txt-compact-small text-ui-fg-muted"
                  : isFreeShipping
                    ? "shrink-0 txt-compact-medium-plus text-status-success"
                    : "shrink-0 txt-compact-medium-plus text-ui-fg-base"
              )}
              data-testid={unpriced ? "delivery-option-unavailable" : "delivery-option-price"}
            >
              {price === null ? (
                <Loader className="h-3 w-3 animate-spin" />
              ) : (
                price
              )}
            </span>
          </div>
          {description && (
            <span
              className="txt-compact-small text-ui-fg-subtle"
              data-testid="delivery-option-description"
            >
              {description}
            </span>
          )}
          {(deliveryLabel || zone) && (
            <span className="flex flex-wrap gap-x-3 txt-compact-small text-ui-fg-subtle">
              {deliveryLabel && <span>{deliveryLabel}</span>}
              {zone && (
                <span data-testid="delivery-option-zone">
                  {t("shippingZone", { zone })}
                </span>
              )}
            </span>
          )}
          {/*
            The CDEK point and term are shown only once this method IS
            the cart's: both come from `shipping_methods[].data`, which
            the provider writes, and inventing either before the buyer
            has chosen would be a number nobody measured.
          */}
          {isSelected && isCdekOption(option) && cdekChosen && (
            <span
              className="txt-compact-small text-ui-fg-base"
              data-testid="delivery-option-cdek-point"
            >
              {cdekChosen.name ?? cdekChosen.code}
            </span>
          )}
          {isSelected && isCdekOption(option) && cdekTerm && (
            <span
              className="txt-compact-small text-ui-fg-subtle"
              data-testid="delivery-option-cdek-term"
            >
              {cdekTerm}
            </span>
          )}
          {/*
            The way back into the picker (i03-checkout-pvz-map-address-suggest).
            Clicking the card again cannot do it: `RadioGroup` fires
            `onValueChange` on a CHANGE of value, and the card is already
            the chosen one — so a buyer who picked the wrong point had no
            way at all to pick another (measured 2026-09-16 on the i03
            stand). It sits above the radio's own full-card hit area,
            which is `absolute inset-0 z-10`.
          */}
          {isSelected && isPochtaOption(option) && pochtaChosen && (
            <span
              className="txt-compact-small text-ui-fg-base"
              data-testid="delivery-option-pochta-point"
            >
              {[pochtaChosen.pochta_point_address, pochtaChosen.pochta_point_city]
                .filter(Boolean)
                .join(", ")}{" "}
              · {tPochta("postcode", { index: pochtaChosen.pochta_point_index })}
            </span>
          )}
          {isSelected && isPochtaOption(option) && pochtaChosen?.term_label && (
            <span
              className="txt-compact-small text-ui-fg-subtle"
              data-testid="delivery-option-pochta-term"
            >
              {pochtaChosen.term_label}
            </span>
          )}
          {isSelected && isPochtaOption(option) && (
            <button
              type="button"
              onClick={() => setPochtaSheetOptionId(option.id)}
              className="relative z-20 w-fit txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm"
              data-testid="delivery-option-pochta-change"
            >
              {tCdek("change")}
            </button>
          )}
          {isSelected && cdekNeedsPoint(option) && cdekChosen && (
            <button
              type="button"
              onClick={() => setCdekSheetOptionId(option.id)}
              className="relative z-20 w-fit txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm"
              data-testid="delivery-option-cdek-change"
            >
              {tCdek("change")}
            </button>
          )}
        </div>
      </div>
    )
  }

  /**
   * The folded row's words: the method, its price, and the point or the term
   * the buyer chose with it, the same lines the open row prints.
   */
  const summaryOption = isPickupShippingOption(selectedOption)
    ? pickupCardOption
    : selectedOption
  const summaryPrice = summaryOption
    ? priceOf(summaryOption, isPickupShippingOption(selectedOption)).price
    : null
  const summaryPoint = isPickupShippingOption(selectedOption)
    ? pickupPointName
    : cdekNeedsPoint(selectedOption) && cdekChosen
      ? cdekChosen.name ?? cdekChosen.code
      : isPochtaOption(selectedOption) && pochtaChosen
        ? [pochtaChosen.pochta_point_address, pochtaChosen.pochta_point_city]
            .filter(Boolean)
            .join(", ")
        : null
  const summaryTerm = isCdekOption(selectedOption)
    ? cdekTerm
    : isPochtaOption(selectedOption)
      ? pochtaChosen?.term_label ?? null
      : null

  // Ivan's item 10: a choice that completes the step folds the section, the
  // point picked in a sheet included. The key changes with the method and the
  // point, so picking another one after «Изменить» folds it again; a sheet still
  // open holds the fold until it closes.
  // Only the point of the method that needs one: a point the previous method left on
  // the cart is cleared by the refresh that follows a switch, and counting it would
  // fold the section a second time, after the buyer had opened it again.
  const completionKey = isShippingComplete
    ? [
        shippingMethodId,
        isPickupShippingOption(selectedOption)
          ? pickupPointName
          : cdekNeedsPoint(selectedOption)
            ? cdekChosen?.code ?? ""
            : isPochtaOption(selectedOption)
              ? pochtaChosen?.pochta_point_index ?? ""
              : "",
      ].join("|")
    : null
  const sheetOpen = !!cdekSheetOptionId || !!pochtaSheetOptionId
  const settledKey = useRef(completionKey)
  useEffect(() => {
    if (sheetOpen) return
    if (completionKey && completionKey !== settledKey.current) {
      setCollapsed(true)
    }
    settledKey.current = completionKey
  }, [completionKey, sheetOpen])

  const showSummary = !locked && collapsed && isShippingComplete

  const heading = (
    <span className="flex items-center gap-x-2">
      <span
        className={clx(
          "flex-shrink-0",
          locked ? "text-ui-fg-disabled" : "text-ui-fg-base"
        )}
      >
        <Truck size={24} />
      </span>
      <h2
        className={clx(
          "h2-docs flex items-center gap-x-1.5",
          locked ? "text-ui-fg-disabled" : "text-ui-fg-base"
        )}
      >
        {t("shippingHeading")}
        {isShippingComplete && !locked && (
          <CheckMini
            className="text-status-success shrink-0"
            aria-hidden
            data-testid="shipping-section-checkmark"
          />
        )}
      </h2>
    </span>
  )

  return (
    // Batch 6 part 1: the methods are full-width rows of the left column, one under
    // another, in the Medusa `RadioGroup.ChoiceBox` look (base border, the
    // interactive one when chosen). The 180px cards in a sideways scroller cut the
    // DHL description with «…» and put the radio next to the price.
    <div className="flex flex-col gap-y-4" data-testid="checkout-shipping-section">
      {locked ? (
        // Ivan's item 7: the section waits for the address, its heading alone.
        <div className="py-2" aria-disabled="true" data-testid="checkout-shipping-locked">
          {heading}
        </div>
      ) : showSummary ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          className="flex items-start justify-between w-full gap-x-4 py-2 text-start"
          data-testid="checkout-shipping-summary"
        >
          <span className="flex min-w-0 flex-col gap-y-1">
            {heading}
            <span className="flex flex-col gap-y-0.5 ps-8 txt-small">
              <span className="text-ui-fg-base">
                {[summaryOption?.name, summaryPrice].filter(Boolean).join(" · ")}
              </span>
              {summaryPoint && (
                <span className="text-ui-fg-subtle" data-testid="checkout-shipping-summary-point">
                  {summaryPoint}
                </span>
              )}
              {summaryTerm && <span className="text-ui-fg-subtle">{summaryTerm}</span>}
            </span>
          </span>
          <span className="txt-compact-small-plus text-ui-fg-interactive shrink-0 pt-1">
            {t("edit")}
          </span>
        </button>
      ) : (
        <>
          <div className="flex flex-row items-start justify-between gap-x-4">
            <div className="flex flex-col gap-y-1">
              {heading}
              <p className="ps-8 txt-compact-medium text-ui-fg-muted">
                {t("shippingDescription")}
              </p>
            </div>

            {/* N9: the list is the shop's own regions (`listShopRegions`); a shop that
                sells in one country names it, with nothing to open. */}
            {countryOptions.length <= 1 ? (
              <span
                className="flex shrink-0 items-center gap-x-1.5 txt-compact-medium-plus text-ui-fg-subtle"
                data-testid="checkout-country-select"
              >
                {selectedCountryOption?.label ?? "—"}
              </span>
            ) : (
              <DropdownMenu dir={dir}>
                <DropdownMenu.Trigger
                  className={clx(
                    "flex shrink-0 items-center gap-x-1.5 txt-compact-medium-plus text-ui-fg-subtle hover:text-ui-fg-base transition-colors",
                    isPending && "opacity-60 cursor-wait"
                  )}
                  disabled={isPending}
                  data-testid="checkout-country-select"
                >
                  {isPending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CursorDefault />
                      <span>{selectedCountryOption?.label ?? "—"}</span>
                    </>
                  )}
                </DropdownMenu.Trigger>

                <DropdownMenu.Content
                  align="end"
                  className="w-48 max-h-60 overflow-y-auto no-scrollbar"
                >
                  <DropdownMenu.RadioGroup
                    value={selectedCountryOption?.country}
                    onValueChange={handleRegionChange}
                  >
                    {countryOptions.map((opt) => (
                      <DropdownMenu.RadioItem
                        key={opt.country}
                        value={opt.country}
                      >
                        {opt.label}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu>
            )}
          </div>

          {cards.length > 0 ? (
            <RadioGroup
              dir={dir}
              value={radioGroupValue}
              onValueChange={handleValueChange}
              className="flex flex-col gap-y-2"
            >
              {cards.map((card) =>
                renderRow(
                  card,
                  card.kind === "pickup"
                    ? !!shippingMethodId && pickupOptionIds.has(shippingMethodId)
                    : card.option.id === shippingMethodId
                )
              )}
            </RadioGroup>
          ) : (
            <p className="txt-compact-small text-ui-fg-subtle">
              {t("shippingUnavailable")}
            </p>
          )}

          {/* Ivan's item 7: «Далее», disabled until the method (and its point)
              is chosen; it folds the section like the choice itself does. */}
          {cards.length > 0 && (
            <Button
              type="button"
              size="large"
              className="w-full"
              disabled={!isShippingComplete || isPending}
              onClick={() => setCollapsed(true)}
              data-testid="checkout-shipping-next"
            >
              {t("next")}
            </Button>
          )}
        </>
      )}

      {shippingError && (
        <p className="txt-compact-small text-ui-fg-error">
          {getErrorMessage(shippingError)}
        </p>
      )}

      {cdekSheetOption && (
        <CheckoutCdekPointSheet
          open
          onClose={() => setCdekSheetOptionId(null)}
          initialCity={cityForPointSearch(cart)}
          pointType={cdekKindOf(cdekSheetOption) === "postamat" ? "POSTAMAT" : "PVZ"}
          selectedCode={cdekChosen?.code ?? null}
          onChoose={handleChooseCdekPoint}
          priceLabel={cdekSheetPriceLabel}
          termLabel={cdekTerm}
        />
      )}

      {pochtaSheetOptionId && (
        <CheckoutPochtaPointSheet
          open
          onClose={() => setPochtaSheetOptionId(null)}
          initialCity={pochtaChosen?.pochta_point_city ?? cityForPochtaSearch(cart)}
          selectedIndex={pochtaChosen?.pochta_point_index ?? null}
          onChoose={handleChoosePochtaPoint}
          currencyCode={cart.currency_code}
        />
      )}
    </div>
  )
}
