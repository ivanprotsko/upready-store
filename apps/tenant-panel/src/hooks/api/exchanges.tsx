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

// tenant-panel: piece 2. Same shape as returns.tsx: `GET /tenants/exchanges`
// answers an empty page by design, so the active-exchange section renders
// nothing, and the two cancel mutations exist only so it compiles.

const EXCHANGES_QUERY_KEY = "exchanges" as const
export const exchangesQueryKeys = queryKeysFactory(EXCHANGES_QUERY_KEY)

export const useExchanges = (
  query?: HttpTypes.AdminExchangeListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminExchangeListResponse,
      FetchError,
      HttpTypes.AdminExchangeListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminExchangeListResponse>(
        "/tenants/exchanges",
        { query }
      ),
    queryKey: exchangesQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCancelExchange = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminExchangeResponse, FetchError>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel an exchange"),
    ...options,
  })
}

export const useCancelExchangeRequest = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminExchangeDeleteResponse,
    FetchError
  >
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel an exchange request"),
    ...options,
  })
}
