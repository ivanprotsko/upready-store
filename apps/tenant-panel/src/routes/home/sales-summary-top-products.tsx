import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { getStylizedAmount } from "../../lib/money-amount-helpers"

type SalesSummaryTopProductsProps = {
  products: { product_id: string; title: string; quantity: number; revenue: number }[]
  currencyCode: string
}

/** The rows of the best sellers: the name on the left, the sum at the right edge. */
export const SalesSummaryTopProductsList = ({ products, currencyCode, narrow = false }: SalesSummaryTopProductsProps & { narrow?: boolean }) => {
  const { t } = useTranslation()

  return products.length === 0 ? (
    <Text size="small" className="text-ui-fg-subtle">
      {t("salesSummary.noSalesThisPeriod")}
    </Text>
  ) : (
    // Gemini critique 2 (1.1, 6.1): on a phone a name cut after twenty letters
    // does not tell one balm from another, so it takes two lines. On «Обзор» the
    // list is capped on a wide screen so the money stays next to its name; in a
    // panel of its own it runs the full width and the money sits at the right edge.
    <ul className={narrow ? "flex flex-col gap-y-2 md:max-w-2xl" : "flex flex-col gap-y-2"}>
      {products.map((product) => (
        <li key={product.product_id} className="flex items-center justify-between gap-x-4 max-md:items-start">
          <Text size="small" className="min-w-0 max-md:line-clamp-2 md:truncate" title={product.title}>
            {product.title}
          </Text>
          <Text size="small" className="shrink-0 text-right text-ui-fg-subtle">
            {t("salesSummary.topProductRow", {
              quantity: product.quantity,
              revenue: getStylizedAmount(product.revenue, currencyCode),
            })}
          </Text>
        </li>
      ))}
    </ul>
  )
}

/** The five best-selling products of the current period, by revenue. */
export const SalesSummaryTopProducts = ({ products, currencyCode }: SalesSummaryTopProductsProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-2 rounded-lg border p-4">
      <Text size="small" weight="plus">
        {t("salesSummary.topProducts")}
      </Text>
      <SalesSummaryTopProductsList products={products} currencyCode={currencyCode} narrow />
    </div>
  )
}
