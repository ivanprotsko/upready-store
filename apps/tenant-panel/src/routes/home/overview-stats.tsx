import { useTranslation } from "react-i18next"
import { useProducts } from "../../hooks/api/products"
import { OverviewStatCard } from "./overview-stat-card"

// f15-overview-empty: the Overview's first real numbers — how many products
// are live vs. still drafts. Two `count`-only requests (`limit: 1`,
// `fields: "id"`), each read the way `SalesSummary` reads its own query:
// `isPending` is a real "loading" state, never a guessed zero (rule 19h).
//
// "Заказы ждут сборки" from the task's "Что сделать" stayed out: the Admin's
// `AdminGetOrdersParams` (apps/backend, `api/admin/orders/validators.js`,
// merged unchanged into `/tenants/orders`) has no `fulfillment_status`
// filter, so that count needs a backend route change this task did not
// scope — left for a follow-up, not guessed client-side.
export const OverviewStats = () => {
  const { t } = useTranslation()

  const {
    count: publishedCount,
    isPending: isPublishedPending,
    isError: isPublishedError,
    error: publishedError,
  } = useProducts({ status: ["published"], limit: 1, fields: "id" })

  const {
    count: draftCount,
    isPending: isDraftPending,
    isError: isDraftError,
    error: draftError,
  } = useProducts({ status: ["draft"], limit: 1, fields: "id" })

  if (isPublishedError) {
    throw publishedError
  }
  if (isDraftError) {
    throw draftError
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <OverviewStatCard
        label={t("overview.productsPublished")}
        value={publishedCount ?? 0}
        isPending={isPublishedPending}
        testId="overview-products-published"
      />
      <OverviewStatCard
        label={t("overview.productsDraft")}
        value={draftCount ?? 0}
        isPending={isDraftPending}
        testId="overview-products-draft"
      />
    </div>
  )
}
