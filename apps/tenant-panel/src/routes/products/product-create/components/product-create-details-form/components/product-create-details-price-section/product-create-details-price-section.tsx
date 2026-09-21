import { Input, Text } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../../../components/common/form"
import { usePricingScope } from "../../../../../common/use-pricing-scope"
import { ProductCreateSchemaType } from "../../../../types"

type ProductCreatePriceSectionProps = {
  form: UseFormReturn<ProductCreateSchemaType>
}

/**
 * The price of a product that is sold as one thing, right on the first step
 * (o21-owner-panel-ux, «photos first»). The price grid of the «Варианты» step is
 * a spreadsheet: fine for twenty sizes on a desktop, not for one jar of balm on
 * a phone. The field writes the same form value the grid edits
 * (`variants.0.prices.<shop currency>`), so the two never disagree; a product
 * with variants keeps its prices in the grid and this field steps aside.
 */
export const ProductCreatePriceSection = ({ form }: ProductCreatePriceSectionProps) => {
  const { t } = useTranslation()
  const scope = usePricingScope()
  const withVariants = useWatch({ control: form.control, name: "enable_variants" })
  const currency = scope.shopCurrency ?? scope.currencies[0]

  if (withVariants || !scope.isReady || !currency) {
    return null
  }

  return (
    <div id="quick-price" className="flex flex-col gap-y-2">
      <Form.Field
        control={form.control}
        name={`variants.0.prices.${currency}`}
        render={({ field: { value, onChange, ...field } }) => (
          <Form.Item>
            <Form.Label>{scope.currencyLabel(currency)}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                inputMode="decimal"
                autoComplete="off"
                value={value ?? ""}
                onChange={(event) => onChange(event.target.value.replace(",", "."))}
                placeholder="0"
                data-testid="product-create-quick-price"
              />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Text size="small" className="text-ui-fg-subtle">
        {t("products.create.quickPrice.hint")}
      </Text>
    </div>
  )
}
