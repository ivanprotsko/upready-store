import { HttpTypes } from "@medusajs/types"
import { Label, Switch } from "@medusajs/ui"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import { useRegions } from "../../../hooks/api/regions"
import { useStore } from "../../../hooks/api/store"
import { currencies as CURRENCY_CATALOG } from "../../../lib/data/currencies"

/**
 * f09-price-editor-currencies: which currency columns a price grid opens with.
 *
 * The store row is shared by every tenant and the seed gives it 118 supported
 * currencies and 241 regions, so the copied Admin grids rendered a column per
 * currency AND a column per region — ~360 columns in the order the store
 * happens to keep them. On the live shop that put «Цена RUB» 89th: 95 Tab
 * presses from the top of the screen, and the create wizard drew no rouble
 * field at all inside the first screenful.
 *
 * A shop prices in its own currency. So the grid opens with that one first,
 * plus whatever currencies (and region-scoped prices) the product ALREADY
 * carries — hiding a column the product has a price in would leave that price
 * uneditable. Everything else stays one switch away (`PricingCurrencyToggle`),
 * so nothing the Admin could do is lost.
 *
 * Hidden columns are a display choice only: the form keeps every price it
 * loaded in its values, and the submit handlers send them back untouched.
 *
 * The shop's own currency is the owner's pick on `/settings/locale`
 * («Валюта по умолчанию» = the country its default prices in, t06-locale-currency)
 * resolved through that country's region; a shop that never saved the screen
 * falls back to the store's default currency.
 */

export type PricingScope = {
  /** Currency codes to build columns for, the shop's own currency first. */
  currencies: string[]
  /** Regions to build region-price columns for. */
  regions: HttpTypes.AdminRegion[]
  /** The shop's own currency code, lower-case as Medusa stores it. */
  shopCurrency?: string
  /** Header label for a currency column: «Цена, ₽» for the shop's own. */
  currencyLabel: (code: string) => string
  showAll: boolean
  setShowAll: (value: boolean) => void
  /** Currency + region columns available in total, for the toggle's label. */
  totalColumnCount: number
  /** How many of them the narrow scope leaves out. */
  hiddenColumnCount: number
}

type UsePricingScopeArgs = {
  /**
   * Currency codes the edited product already has prices in. Passed as a
   * plain array; the hook keys its memos on the joined string, so a caller
   * rebuilding the array every render does not remount the grid.
   */
  usedCurrencies?: string[]
  /** Region ids the edited product already has region-scoped prices for. */
  usedRegionIds?: string[]
}

export const usePricingScope = ({
  usedCurrencies = [],
  usedRegionIds = [],
}: UsePricingScopeArgs = {}): PricingScope => {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)

  const { store } = useStore()
  const { regions } = useRegions({ limit: 9999 })
  const { locale_settings: localeSettings } = useTenantLocaleSettings()

  const usedCurrencyKey = usedCurrencies.join(",")
  const usedRegionKey = usedRegionIds.join(",")

  const supported = useMemo(
    () => (store?.supported_currencies ?? []).map((c) => c.currency_code),
    [store]
  )

  const shopCurrency = useMemo(() => {
    const storeDefault =
      store?.supported_currencies?.find((c) => c.is_default)?.currency_code ??
      supported[0]

    const country = localeSettings?.default_country?.toLowerCase()
    const byCountry = country
      ? regions?.find((region) =>
          region.countries?.some((c) => c.iso_2?.toLowerCase() === country)
        )?.currency_code
      : undefined

    // A currency the store does not support cannot carry a price, so an
    // owner's country whose region prices in one falls back to the store's.
    return byCountry && supported.includes(byCountry) ? byCountry : storeDefault
  }, [store, supported, regions, localeSettings])

  const allCurrencies = useMemo(() => {
    if (!shopCurrency) {
      return supported
    }

    return [shopCurrency, ...supported.filter((code) => code !== shopCurrency)]
  }, [supported, shopCurrency])

  const scopedRegions = useMemo(() => {
    if (showAll) {
      return regions ?? []
    }

    const used = new Set(usedRegionKey ? usedRegionKey.split(",") : [])
    return (regions ?? []).filter((region) => used.has(region.id))
  }, [showAll, regions, usedRegionKey])

  const scopedCurrencies = useMemo(() => {
    if (showAll) {
      return allCurrencies
    }

    const used = new Set(usedCurrencyKey ? usedCurrencyKey.split(",") : [])
    // A region column renders an empty cell unless its own currency is in the
    // list (`create-data-grid-price-columns.tsx`), so a kept region keeps its
    // currency too.
    scopedRegions.forEach((region) => used.add(region.currency_code))

    const narrow = allCurrencies.filter(
      (code) => code === shopCurrency || used.has(code)
    )

    // Never zero columns: a store with no supported currency at all would
    // otherwise render a grid the owner cannot type a price into.
    return narrow.length ? narrow : allCurrencies.slice(0, 1)
  }, [showAll, allCurrencies, shopCurrency, usedCurrencyKey, scopedRegions])

  const totalColumnCount = allCurrencies.length + (regions?.length ?? 0)
  const hiddenColumnCount =
    totalColumnCount - (scopedCurrencies.length + scopedRegions.length)

  const currencyLabel = useCallback(
    (code: string) => {
      const symbol = CURRENCY_CATALOG[
        code.toUpperCase()
      ]?.symbol_native?.replace(/\.+$/, "")

      if (code === shopCurrency && symbol) {
        return t("fields.priceShopTemplate", {
          symbol,
          defaultValue: "Цена, {{symbol}}",
        })
      }

      return t("fields.priceTemplate", {
        regionOrCurrency: code.toUpperCase(),
      })
    },
    [t, shopCurrency]
  )

  return {
    currencies: scopedCurrencies,
    regions: scopedRegions,
    shopCurrency,
    currencyLabel,
    showAll,
    setShowAll,
    totalColumnCount,
    hiddenColumnCount,
  }
}

type PricingCurrencyToggleProps = Pick<
  PricingScope,
  "showAll" | "setShowAll" | "totalColumnCount" | "hiddenColumnCount"
>

/**
 * The switch that puts the other currencies back. Rendered as the data grid's
 * `headerContent`, next to its own «Вид» dropdown.
 */
export const PricingCurrencyToggle = ({
  showAll,
  setShowAll,
  totalColumnCount,
  hiddenColumnCount,
}: PricingCurrencyToggleProps) => {
  const { t } = useTranslation()

  // Nothing is hidden (a store with one currency and no regions): no switch.
  if (!showAll && hiddenColumnCount <= 0) {
    return null
  }

  return (
    <div className="flex items-center gap-x-2 ps-3">
      <Switch
        id="pricing-show-all-currencies"
        data-testid="pricing-show-all-currencies"
        checked={showAll}
        onCheckedChange={setShowAll}
      />
      <Label
        htmlFor="pricing-show-all-currencies"
        size="small"
        weight="plus"
        className="text-ui-fg-subtle"
      >
        {t("products.pricing.showAllCurrencies", {
          count: totalColumnCount,
          defaultValue: "Все валюты ({{count}})",
        })}
      </Label>
    </div>
  )
}
