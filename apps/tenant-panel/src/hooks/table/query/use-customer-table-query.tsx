import { useQueryParams } from "../../use-query-params"

type UseCustomerTableQueryProps = {
  pageSize?: number
}

export type TenantCustomerFilters = {
  limit: number
  offset: number
  order: string
  q?: string
}

/**
 * `q`, `offset` and `order` off the URL, the same shape `use-order-table-query`
 * uses. `order` is not the Admin's generic field name here: `/tenants/customers`
 * accepts `orders_count`/`-orders_count` alongside `created_at`/`-created_at`
 * (`apps/backend/src/api/tenants/customers/validators.ts`), both computed
 * server-side, so this hook passes the raw string through rather than
 * validating it a second time.
 */
export const useCustomerTableQuery = ({
  pageSize = 20,
}: UseCustomerTableQueryProps = {}) => {
  const queryObject = useQueryParams(["offset", "q", "order"])

  const { offset, q, order } = queryObject

  const searchParams: TenantCustomerFilters = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    order: order || "-created_at",
    q,
  }

  return {
    searchParams,
    raw: queryObject,
  }
}
