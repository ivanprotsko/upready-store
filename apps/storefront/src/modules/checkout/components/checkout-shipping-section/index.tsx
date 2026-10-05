"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { setShippingMethod, updateRegion } from "@lib/data/cart"
import {
  calculatePriceForShippingOption,
  quoteShippingMethod,
} from "@lib/data/fulfillment"
import { TARIFF_PROVIDER_ID } from "@lib/util/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { getDeliveryDays, isPickupShippingOption } from "@lib/util/fulfillment"
import {
  deliveryWayOf,
  groupDeliveryWays,
  isShippingCardUnpriced,
  lowestDeliveryPrice,
  type DeliveryCarrier,
  type DeliveryWay,
  type DeliveryWayCard,
} from "@lib/util/shipping-card"
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
import { DropdownMenu, RadioGroup, clx } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useErrorMessage } from "@lib/util/use-error-message"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"

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

/**
 * D10: the `RadioGroup.Item` value of a way card («В пункт выдачи», «Курьером
 * до двери»), never a real option id either. Choosing the card opens it; the
 * buyer then picks a carrier's tariff inside, which is what reaches
 * `setShippingMethod`.
 */
const WAY_VALUE: Record<DeliveryWay, string> = {
  pickup: "__way_pickup__",
  courier: "__way_courier__",
}
const wayOfValue = (value: string): DeliveryWay | null =>
  value === WAY_VALUE.pickup ? "pickup" : value === WAY_VALUE.courier ? "courier" : null

type ShippingOption = HttpTypes.StoreCartShippingOptionWithServiceZone
type ShippingRow = { kind: "option"; option: ShippingOption } | { kind: "pickup" }

interface CheckoutShippingSectionProps {
  cart: HttpTypes.StoreCart
  availableShippingOptions:
  | HttpTypes.StoreCartShippingOptionWithServiceZone[]
  | null
  regions: HttpTypes.StoreRegion[]
  currentCountry: string
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
   * D10: the way card the buyer opened. While it is `null`, the card of the
   * cart's own method is the open one. Opening a card with several tariffs
   * changes nothing on the cart until a tariff in it is picked.
   */
  const [openWay, setOpenWay] = useState<DeliveryWay | null>(null)

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
  // the cards say so instead of spinning on quotes that cannot answer.
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
    handleSelectShipping(value)
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

  // D10: with CDEK or Russian Post among the options, their tariffs fold into
  // the «В пункт выдачи» and «Курьером до двери» cards; `null` keeps the plain
  // list (the international shop's one DHL method, a shop of its own tariffs).
  const wayGroups = useMemo(() => groupDeliveryWays(orderedOptions), [orderedOptions])

  // Walk the fetched list in its own order, collapsing every pickup-typed
  // entry into one card at the position the FIRST one would have rendered —
  // courier/pickup/express keep the order the backend seeded them in
  // (D2 frame 1: `[Courier] [Pickup] [Express]`). With way cards, only the
  // options that belong to no card are rows.
  const cards = useMemo(() => {
    const result: ShippingRow[] = []
    let pickupEmitted = false
    for (const option of wayGroups ? wayGroups.rest : orderedOptions) {
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
  }, [orderedOptions, wayGroups])

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
  const selectedWay = deliveryWayOf(selectedOption)?.way ?? null
  // The open card, else the card of the cart's own method. A way whose card is
  // gone (a new address left it no options) is neither.
  const hasWayCard = (way: DeliveryWay | null): way is DeliveryWay =>
    !!way && !!wayGroups?.cards.some((card) => card.way === way)
  const activeWay = hasWayCard(openWay) ? openWay : hasWayCard(selectedWay) ? selectedWay : null
  const outerValue = activeWay ? WAY_VALUE[activeWay] : radioGroupValue
  const hasPickupPointMeta = !!(
    cart.metadata as Record<string, string> | null
  )?.[PICKUP_METADATA_KEYS.name]
  const isShippingComplete =
    !!shippingMethodId &&
    // A card opened for a different way means the buyer is still choosing.
    (!activeWay || activeWay === selectedWay) &&
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
    // the card says why and cannot be chosen.
    const unpriced =
      !isPickupCard &&
      isShippingCardUnpriced({
        priceAmount,
        isLoadingPrices,
        pricedPerPoint: isPochtaOption(option),
      })
    const price = isFreeShipping
      ? t("freeShipping")
      : priceAmount !== null
        ? convertToLocale({
          amount: priceAmount,
          currency_code: cart.currency_code,
          locale,
        })
        : awaitingAddress
          ? t("deliveryPriceAfterAddress")
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

    const { isFreeShipping, awaitingAddress, unpriced, price } = priceOf(
      option,
      isPickupCard
    )

    return (
      <div
        key={itemValue}
        className={clx(
          "relative flex items-start gap-x-3 rounded-lg border px-4 py-3 text-start transition-colors",
          // Without a fill and not selectable: a method the shop cannot
          // charge for (U-12) must not read as the chosen one. The chosen
          // row takes the theme's accent border (`border-ui-border-interactive`,
          // the shop's own colour), not Medusa's interactive shadow, which
          // the themes leave blue (lead's review of #239).
          unpriced
            ? "border-dashed border-ui-border-base bg-ui-bg-disabled"
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
            radio button cannot contain them. */}
        <div
          className={clx(
            "flex h-5 w-5 shrink-0 items-center justify-center",
            unpriced && "invisible"
          )}
        >
          <div
            className={clx(
              "flex h-3.5 w-3.5 items-center justify-center rounded-full",
              isSelected
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
            <span className="txt-compact-medium-plus text-ui-fg-base">
              {option.name}
            </span>
            <span
              className={clx(
                "flex min-h-[20px] items-center",
                // The reason in place of a price is a sentence: it wraps, at
                // most half the row, rather than pushing a 390px page sideways
                // inside a way card (D10).
                unpriced || awaitingAddress
                  ? "max-w-[50%] text-end txt-compact-small text-ui-fg-subtle"
                  : isFreeShipping
                    ? "shrink-0 txt-compact-medium-plus text-status-success"
                    : "shrink-0 txt-compact-medium-plus text-ui-fg-base"
              )}
              data-testid={
                awaitingAddress
                  ? "delivery-option-awaiting-address"
                  : unpriced
                    ? "delivery-option-unavailable"
                    : undefined
              }
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

  const carriersLabel = (carriers: DeliveryCarrier[]) => {
    const names = carriers.map((carrier) =>
      carrier === "cdek" ? t("deliveryCarrierCdek") : t("deliveryCarrierPochta")
    )
    try {
      return new Intl.ListFormat(locale, { type: "conjunction" }).format(names)
    } catch {
      return names.join(", ")
    }
  }

  /**
   * D10: a way card was chosen, or a row of no way. A card with one tariff the
   * carrier priced chooses that tariff at once (its point sheet opens when it
   * needs a point); a card with several waits for the buyer's pick inside it.
   */
  const handleOuterValueChange = (value: string) => {
    const way = wayOfValue(value)
    if (!way) {
      setOpenWay(null)
      handleValueChange(value)
      return
    }
    setOpenWay(way)
    const only = wayGroups?.cards.find((card) => card.way === way)?.options
    if (only?.length === 1 && only[0].id !== shippingMethodId && !priceOf(only[0], false).unpriced) {
      handleValueChange(only[0].id)
    }
  }

  /**
   * D10: «В пункт выдачи» or «Курьером до двери». The card names the carriers
   * whose options it holds and the lowest price among them; open, it lists each
   * carrier's tariffs as the rows the plain list draws, so a point is still
   * picked in that carrier's own sheet. A carrier that failed to price keeps its
   * row locked inside the card (U-12) and takes nothing from the other one.
   */
  const renderWayCard = (card: DeliveryWayCard<ShippingOption>) => {
    const isOpen = activeWay === card.way
    const prices = card.options.map((option) => priceOf(option, false))
    const lowest = lowestDeliveryPrice(prices.map((p) => p.priceAmount))
    const unavailable = !isLoadingPrices && prices.every((p) => p.unpriced)
    const awaitingAddress = lowest === null && prices.some((p) => p.awaitingAddress)
    const chosenHere = card.options.some((option) => option.id === shippingMethodId)
    const title = card.way === "pickup" ? t("deliveryWayPickup") : t("deliveryWayCourier")
    const lowestLabel =
      lowest === null
        ? null
        : lowest === 0
          ? t("freeShipping")
          : convertToLocale({ amount: lowest, currency_code: cart.currency_code, locale })
    const priceLabel =
      lowestLabel !== null && lowest !== 0 && card.options.length > 1
        ? t("deliveryWayFrom", { price: lowestLabel })
        : lowestLabel

    return (
      <div
        key={card.way}
        className={clx(
          "flex flex-col rounded-lg border text-start transition-colors",
          unavailable
            ? "border-dashed border-ui-border-base bg-ui-bg-disabled"
            : isOpen
              ? "border-ui-border-interactive bg-ui-bg-base"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover"
        )}
        data-unavailable={unavailable || undefined}
        data-testid={`delivery-way-${card.way}`}
      >
        <div className="relative flex items-start gap-x-3 px-4 py-3">
          <RadioGroup.Item
            value={WAY_VALUE[card.way]}
            aria-label={title}
            disabled={unavailable}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer disabled:cursor-not-allowed rounded-lg bg-transparent outline-none [&>div]:hidden focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          <div
            className={clx(
              "flex h-5 w-5 shrink-0 items-center justify-center",
              unavailable && "invisible"
            )}
          >
            <div
              className={clx(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full",
                isOpen
                  ? "bg-ui-bg-interactive shadow-borders-interactive-with-shadow"
                  : "bg-ui-bg-base shadow-borders-base"
              )}
            >
              {isOpen && (
                <div className="h-1.5 w-1.5 rounded-full bg-ui-bg-base shadow-details-contrast-on-bg-interactive" />
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-y-1">
            <div className="flex items-start justify-between gap-x-4">
              <span className="txt-compact-medium-plus text-ui-fg-base">{title}</span>
              <span
                className={clx(
                  "flex min-h-[20px] shrink-0 items-center txt-compact-medium-plus",
                  lowest === 0 ? "text-status-success" : "text-ui-fg-base"
                )}
                data-testid="delivery-way-price"
              >
                {priceLabel ??
                  (isLoadingPrices && !awaitingAddress ? (
                    <Loader className="h-3 w-3 animate-spin" />
                  ) : null)}
              </span>
            </div>
            <span
              className="txt-compact-small text-ui-fg-subtle"
              data-testid="delivery-way-carriers"
            >
              {carriersLabel(card.carriers)}
            </span>
            {awaitingAddress ? (
              <span
                className="txt-compact-small text-ui-fg-subtle"
                data-testid="delivery-way-awaiting-address"
              >
                {t("deliveryPriceAfterAddress")}
              </span>
            ) : unavailable ? (
              <span
                className="txt-compact-small text-ui-fg-subtle"
                data-testid="delivery-way-unavailable"
              >
                {t("shippingPriceUnavailable")}
              </span>
            ) : null}
          </div>
        </div>

        {isOpen && !unavailable && (
          <div
            className="flex flex-col gap-y-2 px-4 pb-4 small:ps-12"
            data-testid={`delivery-way-${card.way}-tariffs`}
          >
            {!chosenHere && (
              <p className="txt-compact-small text-ui-fg-subtle">{t("deliveryWayChoose")}</p>
            )}
            <RadioGroup
              dir={dir}
              value={chosenHere ? shippingMethodId! : ""}
              onValueChange={handleValueChange}
              aria-label={title}
              className="flex flex-col gap-y-2"
            >
              {card.options.map((option) =>
                renderRow({ kind: "option", option }, option.id === shippingMethodId)
              )}
            </RadioGroup>
          </div>
        )}
      </div>
    )
  }

  return (
    // Batch 6 part 1: the methods are full-width rows of the left column, one under
    // another, in the Medusa `RadioGroup.ChoiceBox` look (base border, the
    // interactive one when chosen). The 180px cards in a sideways scroller cut the
    // DHL description with «…» and put the radio next to the price.
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row items-start justify-between gap-x-4">
        <div className="flex flex-col">
          <h2 className="h2-docs flex items-center gap-x-1.5">
            {t("shippingHeading")}
            {isShippingComplete && (
              <CheckMini
                className="text-status-success shrink-0"
                aria-hidden
                data-testid="shipping-section-checkmark"
              />
            )}
          </h2>
          <p className="txt-compact-medium text-ui-fg-muted">
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

      {cards.length > 0 || !!wayGroups?.cards.length ? (
        <RadioGroup
          dir={dir}
          value={outerValue}
          onValueChange={handleOuterValueChange}
          className="flex flex-col gap-y-2"
        >
          {wayGroups?.cards.map((wayCard) => renderWayCard(wayCard))}
          {cards.map((card) =>
            renderRow(
              card,
              // A way card that is open owns the choice for now.
              !activeWay &&
                (card.kind === "pickup"
                  ? !!shippingMethodId && pickupOptionIds.has(shippingMethodId)
                  : card.option.id === shippingMethodId)
            )
          )}
        </RadioGroup>
      ) : (
        <p className="txt-compact-small text-ui-fg-subtle">
          {t("shippingUnavailable")}
        </p>
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
