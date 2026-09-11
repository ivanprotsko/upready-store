import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { notBuiltMutation } from "./not-built"

// tenant-panel: piece 2. RMA is view-only in the panel. The list hook is real
// and calls `GET /tenants/returns`, which answers an empty page by design (see
// the route file and docs/tenant-panel/api-contract.md, "Piece 2"), so the
// order-detail return sections render nothing instead of crashing. The two
// cancel mutations exist only so the copied section compiles; nothing in the
// panel can reach them while the list is empty.

const RETURNS_QUERY_KEY = "returns" as const
export const returnsQueryKeys = queryKeysFactory(RETURNS_QUERY_KEY)

export const useReturns = (
  query?: HttpTypes.AdminReturnFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminReturnsResponse,
      FetchError,
      HttpTypes.AdminReturnsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminReturnsResponse>("/tenants/returns", {
        query,
      }),
    queryKey: returnsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCancelReturn = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminReturnResponse, FetchError>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel a return"),
    ...options,
  })
}

export const useCancelReturnRequest = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminReturnResponse, FetchError>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel a return request"),
    ...options,
  })
}
