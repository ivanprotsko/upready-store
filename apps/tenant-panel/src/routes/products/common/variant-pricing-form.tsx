import { HttpTypes } from "@medusajs/types"
import { Tooltip } from "@medusajs/ui"
import { useMemo } from "react"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  DataGrid,
  createDataGridHelper,
  createDataGridPriceColumns,
} from "../../../components/data-grid"
import { useRouteModal } from "../../../components/modals/index"
import { usePricePreferences } from "../../../hooks/api/price-preferences"
import { ProductCreateSchemaType } from "../product-create/types"
import { PricingCurrencyToggle, usePricingScope } from "./use-pricing-scope"

type VariantPricingFormProps = {
  form: UseFormReturn<ProductCreateSchemaType>
  /**
   * Currency codes and region ids the edited product already has prices in.
   * They stay visible whatever the shop's own currency is, so an existing
   * price never becomes uneditable (f09-price-editor-currencies).
   */
  usedCurrencies?: string[]
  usedRegionIds?: string[]
}

export const VariantPricingForm = ({
  form,
  usedCurrencies,
  usedRegionIds,
}: VariantPricingFormProps) => {
  const { price_preferences: pricePreferences } = usePricePreferences({})
  const scope = usePricingScope({ usedCurrencies, usedRegionIds })

  const { setCloseOnEscape } = useRouteModal()

  const columns = useVariantPriceGridColumns({
    currencies: scope.currencies,
    regions: scope.regions,
    pricePreferences,
    currencyLabel: scope.currencyLabel,
  })

  const variants = useWatch({
    control: form.control,
    name: "variants",
  }) as any

  return (
    <DataGrid
      columns={columns}
      data={variants}
      state={form}
      onEditingChange={(editing) => setCloseOnEscape(!editing)}
      headerContent={<PricingCurrencyToggle {...scope} />}
    />
  )
}

const columnHelper = createDataGridHelper<
  HttpTypes.AdminProductVariant,
  ProductCreateSchemaType
>()

const useVariantPriceGridColumns = ({
  currencies = [],
  regions = [],
  pricePreferences = [],
  currencyLabel,
}: {
  currencies?: string[]
  regions?: HttpTypes.AdminRegion[]
  pricePreferences?: HttpTypes.AdminPricePreference[]
  currencyLabel?: (code: string) => string
}) => {
  const { t } = useTranslation()

  return useMemo(() => {
    return [
      columnHelper.column({
        id: t("fields.title"),
        header: t("fields.title"),
        cell: (context) => {
          const entity = context.row.original
          return (
            <DataGrid.ReadonlyCell context={context}>
              <div className="flex h-full w-full items-center gap-x-2 overflow-hidden">
                <Tooltip content={entity.title}>
                  <span className="truncate">{entity.title}</span>
                </Tooltip>
              </div>
            </DataGrid.ReadonlyCell>
          )
        },
        disableHiding: true,
      }),
      ...createDataGridPriceColumns<
        HttpTypes.AdminProductVariant,
        ProductCreateSchemaType
      >({
        currencies,
        regions,
        pricePreferences,
        currencyLabel,
        getFieldName: (context, value) => {
          if (context.column.id?.startsWith("currency_prices")) {
            return `variants.${context.row.index}.prices.${value}`
          }
          return `variants.${context.row.index}.prices.${value}`
        },
        t,
      }),
    ]
  }, [t, currencies, regions, pricePreferences, currencyLabel])
}
