import { useMemo } from "react"
import { UseFormReturn, useWatch } from "react-hook-form"
import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { CreateProductVariantSchema } from "./constants"
import { usePricePreferences } from "../../../../../hooks/api/price-preferences"
import { useRouteModal } from "../../../../../components/modals"
import {
  PricingCurrencyToggle,
  usePricingScope,
} from "../../../common/use-pricing-scope"
import {
  createDataGridHelper,
  createDataGridPriceColumns,
  DataGrid,
} from "../../../../../components/data-grid"

type PricingTabProps = {
  form: UseFormReturn<z.infer<typeof CreateProductVariantSchema>>
}

function PricingTab({ form }: PricingTabProps) {
  const { price_preferences: pricePreferences } = usePricePreferences({})

  // f09-price-editor-currencies: a brand-new variant has no prices yet, so the
  // grid opens on the shop's own currency; the rest are one switch away.
  const scope = usePricingScope()

  const { setCloseOnEscape } = useRouteModal()

  const columns = useVariantPriceGridColumns({
    currencies: scope.currencies,
    regions: scope.regions,
    pricePreferences,
    currencyLabel: scope.currencyLabel,
  })

  const variant = useWatch({
    control: form.control,
  }) as any

  return (
    <DataGrid
      columns={columns}
      data={[variant]}
      state={form}
      onEditingChange={(editing) => setCloseOnEscape(!editing)}
      headerContent={<PricingCurrencyToggle {...scope} />}
    />
  )
}

const columnHelper = createDataGridHelper<
  HttpTypes.AdminProductVariant,
  z.infer<typeof CreateProductVariantSchema>
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
                <span className="truncate">{entity.title}</span>
              </div>
            </DataGrid.ReadonlyCell>
          )
        },
        disableHiding: true,
      }),
      ...createDataGridPriceColumns<
        HttpTypes.AdminProductVariant,
        z.infer<typeof CreateProductVariantSchema>
      >({
        currencies,
        regions,
        pricePreferences,
        currencyLabel,
        getFieldName: (context, value) => {
          if (context.column.id?.startsWith("currency_prices")) {
            return `prices.${value}`
          }
          return `prices.${value}`
        },
        t,
      }),
    ]
  }, [t, currencies, regions, pricePreferences, currencyLabel])
}

export default PricingTab
