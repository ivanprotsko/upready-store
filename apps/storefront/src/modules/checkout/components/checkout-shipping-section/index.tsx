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
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import { usePickupSheet } from "@modules/checkout/context/pickup-sheet-context"
import { Loader, CursorDefault } from "@medusajs/icons"
import { DropdownMenu, RadioGroup, clx } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useErrorMessage } from "@lib/util/use-error-message"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"

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

/** A string the owner wrote into the method's `data` (description, delivery hint), or null. */
const dataText = (
  option: HttpTypes.StoreCartShippingOption,
  key: "description" | "delivery_hint"
): string | null => {
  const value = (option.data as Record<string, unknown> | null)?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export default function CheckoutShippingSection({
  cart,
  availableShippingOptions,
  regions,
  currentCountry,
}: CheckoutShippingSectionProps) {
  const t = useTranslations("CheckoutPage")
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
  // t04-shipping-tariffs: the backend's one-line reason for a tariff price
  // («2,4 кг × 180 ₽ + 150 ₽»), keyed by option id.
  const [explanationsMap, setExplanationsMap] = useState<
    Record<string, string>
  >({})
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null
  )

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

  useEffect(() => {
    setIsLoadingPrices(true)
    if (!shippingOptions?.length) {
      setIsLoadingPrices(false)
      return
    }

    const calculatedMethods = shippingOptions.filter(
      (sm) => sm.price_type === "calculated"
    )

    if (!calculatedMethods.length) {
      setIsLoadingPrices(false)
      return
    }

    // A tenant tariff method is priced by the quote route (amount + the
    // explanation line); every other calculated option by Medusa's own
    // `/calculate`. Both run on the backend.
    Promise.allSettled(
      calculatedMethods.map(async (sm) => {
        if (sm.provider_id === TARIFF_PROVIDER_ID) {
          const quote = await quoteShippingMethod(sm.id, cart.id)
          return quote
            ? { id: sm.id, amount: quote.amount, explanation: quote.explanation }
            : null
        }
        const priced = await calculatePriceForShippingOption(sm.id, cart.id)
        return priced?.id
          ? { id: priced.id, amount: priced.amount ?? 0, explanation: "" }
          : null
      })
    ).then((results) => {
      const pricesMap: Record<string, number> = {}
      const reasons: Record<string, string> = {}
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value?.id) {
          pricesMap[r.value.id] = r.value.amount
          if (r.value.explanation) {
            reasons[r.value.id] = r.value.explanation
          }
        }
      })
      setCalculatedPricesMap(pricesMap)
      setExplanationsMap(reasons)
      setIsLoadingPrices(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableShippingOptions, cart.id])

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

  const handleValueChange = (value: string) => {
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

  // Walk the fetched list in its own order, collapsing every pickup-typed
  // entry into one card at the position the FIRST one would have rendered —
  // courier/pickup/express keep the order the backend seeded them in
  // (D2 frame 1: `[Courier] [Pickup] [Express]`).
  const cards = useMemo(() => {
    const result: (
      | { kind: "option"; option: HttpTypes.StoreCartShippingOptionWithServiceZone }
      | { kind: "pickup" }
    )[] = []
    let pickupEmitted = false
    // The owner's order from the panel's /shipping screen (`data.sort_order`);
    // options without one keep the API order after the ordered ones.
    const ordered = [...(shippingOptions ?? [])].sort(
      (a, b) => sortOrderOf(a) - sortOrderOf(b)
    )
    for (const option of ordered) {
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
  }, [shippingOptions])

  const radioGroupValue = shippingMethodId && pickupOptionIds.has(shippingMethodId)
    ? PICKUP_GROUP_VALUE
    : shippingMethodId ?? undefined

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row items-start justify-between gap-x-4">
        <div className="flex flex-col">
          <h2 className="h2-docs">{t("shippingHeading")}</h2>
          <p className="txt-compact-medium text-ui-fg-muted">
            {t("shippingDescription")}
          </p>
        </div>

        <DropdownMenu dir={dir}>
          <DropdownMenu.Trigger
            className={clx(
              "mb-6 flex items-center gap-x-1.5 txt-compact-medium-plus text-ui-fg-subtle hover:text-ui-fg-base transition-colors",
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
      </div>

      {/* Shipping method cards */}
      <div className="overflow-x-auto no-scrollbar px-px pb-1">
        {cards.length > 0 ? (
          <RadioGroup
            dir={dir}
            value={radioGroupValue}
            onValueChange={handleValueChange}
            className="flex items-stretch gap-x-2"
          >
            {cards.map((card) => {
              const isPickupCard = card.kind === "pickup"
              const option = isPickupCard ? pickupCardOption! : card.option
              const itemValue = isPickupCard ? PICKUP_GROUP_VALUE : option.id
              const isSelected = isPickupCard
                ? !!shippingMethodId && pickupOptionIds.has(shippingMethodId)
                : option.id === shippingMethodId

              const days = getDeliveryDays(option)
              const deliveryHint = dataText(option, "delivery_hint")
              const description = dataText(option, "description")
              const explanation = explanationsMap[option.id] ?? null
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

              const priceAmount =
                option.price_type === "flat"
                  ? option.amount!
                  : calculatedPricesMap[option.id] !== undefined
                    ? calculatedPricesMap[option.id]
                    : null
              const isFreeShipping = priceAmount === 0
              const price = isFreeShipping
                ? t("freeShipping")
                : priceAmount !== null
                  ? convertToLocale({
                    amount: priceAmount,
                    currency_code: cart.currency_code,
                    locale,
                  })
                  : isLoadingPrices
                    ? null
                    : "—"

              return (
                <div
                  key={itemValue}
                  className={clx(
                    "relative flex w-[180px] shrink-0 flex-col gap-2 justify-between rounded-md border bg-ui-bg-base p-3 text-start transition-colors hover:bg-ui-bg-base-hover",
                    isSelected
                      ? "border-ui-border-interactive"
                      : "border-ui-border-base hover:border-ui-border-interactive/50"
                  )}
                  data-testid={
                    isPickupCard ? "delivery-option-pickup" : "delivery-option-radio"
                  }
                >
                  <RadioGroup.Item
                    value={itemValue}
                    aria-label={option.name}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer rounded-md bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&>div]:hidden focus-visible:shadow-borders-interactive-with-focus"
                  />
                  <span className="txt-compact-medium-plus text-ui-fg-base">
                    {option.name}
                  </span>
                  {description && (
                    <span
                      className="txt-compact-xsmall text-ui-fg-muted line-clamp-2"
                      data-testid="delivery-option-description"
                    >
                      {description}
                    </span>
                  )}
                  <div className="flex flex-col gap-y-0">
                    <div className="min-h-[20px]">
                      {deliveryLabel && (
                        <span className="txt-compact-small text-ui-fg-subtle">
                          {deliveryLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-x-3">
                      <div
                        className={clx(
                          "txt-compact-small-plus flex min-h-[20px] items-end",
                          isFreeShipping
                            ? "text-ui-tag-green-icon"
                            : "text-ui-fg-subtle"
                        )}
                      >
                        {price === null ? (
                          <Loader className="h-3 w-3 animate-spin" />
                        ) : (
                          price
                        )}
                      </div>

                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <div
                          className={clx(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-ui-bg-base shadow-borders-base",
                            isSelected
                              ? "border-ui-border-interactive bg-ui-bg-interactive shadow-borders-interactive-with-shadow"
                              : "border-ui-border-base"
                          )}
                        >
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-ui-bg-base shadow-details-contrast-on-bg-interactive" />
                          )}
                        </div>
                      </div>
                    </div>
                    {explanation && price !== null && (
                      <span
                        className="txt-compact-xsmall text-ui-fg-muted"
                        data-testid="delivery-option-explanation"
                      >
                        {explanation}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </RadioGroup>
        ) : (
          <p className="txt-compact-small text-ui-fg-subtle">
            {t("shippingUnavailable")}
          </p>
        )}
      </div>

      {shippingError && (
        <p className="txt-compact-small text-rose-500">
          {getErrorMessage(shippingError)}
        </p>
      )}
    </div>
  )
}
