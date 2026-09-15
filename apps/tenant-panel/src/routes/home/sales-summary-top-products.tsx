import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { getStylizedAmount } from "../../lib/money-amount-helpers"

type SalesSummaryTopProductsProps = {
  products: { product_id: string; title: string; quantity: number; revenue: number }[]
  currencyCode: string
}

/** The five best-selling products of the current period, by revenue. */
export const SalesSummaryTopProducts = ({ products, currencyCode }: SalesSummaryTopProductsProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-2 rounded-lg border p-4">
      <Text size="small" weight="plus">
        {t("salesSummary.topProducts")}
      </Text>
      {products.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          {t("salesSummary.noSalesThisPeriod")}
        </Text>
      ) : (
        <ul className="flex flex-col gap-y-2">
          {products.map((product) => (
            <li key={product.product_id} className="flex items-center justify-between gap-x-4">
              <Text size="small" className="truncate">
                {product.title}
              </Text>
              <Text size="small" className="shrink-0 text-ui-fg-subtle">
                {t("salesSummary.topProductRow", {
                  quantity: product.quantity,
                  revenue: getStylizedAmount(product.revenue, currencyCode),
                })}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
