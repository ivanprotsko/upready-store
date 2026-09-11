// tenant-panel: tenant equivalent of the Admin's hooks/api/campaigns.tsx, every
// admin-module call swapped for an `sdk.client.fetch` against the matching
// `/tenants/campaigns/*` route. Same reason as promotions.tsx: the js-sdk's admin
// module hardcodes the `/admin/...` prefix. Query keys and invalidations are the
// Admin's, so the copied campaign screens read the cache unchanged.
import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes, LinkMethodRequest } from "@medusajs/types"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { promotionsQueryKeys } from "./promotions"

const REGIONS_QUERY_KEY = "campaigns" as const
export const campaignsQueryKeys = queryKeysFactory(REGIONS_QUERY_KEY)

export const useCampaign = (
  id: string,
  query?: HttpTypes.AdminGetCampaignParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminCampaignResponse,
      FetchError,
      HttpTypes.AdminCampaignResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: campaignsQueryKeys.detail(id),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminCampaignResponse>(`/tenants/campaigns/${id}`, {
        query,
      }),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCampaigns = (
  query?: HttpTypes.AdminGetCampaignsParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminCampaignListResponse,
      FetchError,
      HttpTypes.AdminCampaignListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminCampaignListResponse>("/tenants/campaigns", {
        query,
      }),
    queryKey: campaignsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateCampaign = (
  options?: UseMutationOptions<
    HttpTypes.AdminCampaignResponse,
    FetchError,
    HttpTypes.AdminCreateCampaign
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminCampaignResponse>("/tenants/campaigns", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateCampaign = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminCampaignResponse,
    FetchError,
    HttpTypes.AdminUpdateCampaign
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminCampaignResponse>(`/tenants/campaigns/${id}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.details() })
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.details() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteCampaign = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.DeleteResponse<"campaign">,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.DeleteResponse<"campaign">>(
        `/tenants/campaigns/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.details() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useAddOrRemoveCampaignPromotions = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminCampaignResponse,
    FetchError,
    LinkMethodRequest
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminCampaignResponse>(
        `/tenants/campaigns/${id}/promotions`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.details() })
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.details() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
