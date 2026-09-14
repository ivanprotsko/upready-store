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

// tenant-panel: piece 2. Same shape as returns.tsx: `GET /tenants/claims`
// answers an empty page by design, so the active-claim section renders
// nothing, and the two cancel mutations exist only so it compiles.

const CLAIMS_QUERY_KEY = "claims" as const
export const claimsQueryKeys = queryKeysFactory(CLAIMS_QUERY_KEY)

export const useClaims = (
  query?: HttpTypes.AdminClaimListParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminClaimListResponse,
      FetchError,
      HttpTypes.AdminClaimListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminClaimListResponse>("/tenants/claims", {
        query,
      }),
    queryKey: claimsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCancelClaim = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminClaimResponse, FetchError>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel a claim"),
    ...options,
  })
}

export const useCancelClaimRequest = (
  _id: string,
  _orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminClaimDeleteResponse, FetchError>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel a claim request"),
    ...options,
  })
}
