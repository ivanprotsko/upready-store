// tenant-panel: tenant equivalent of the Admin's hooks/api/promotions.tsx. Every
// hook is the Admin's own hook with its admin-module call replaced by an
// `sdk.client.fetch` against the matching `/tenants/promotions/*` route: the
// js-sdk's admin module hardcodes the `/admin/...` prefix, so the URL is the one
// thing that cannot be reused. Paths, bodies, query keys and invalidations are the
// Admin's, because the copied screens read the cache through the same keys and the
// backend mirrors the Admin's routes one for one
// (docs/tenant-panel/api-contract.md, section "Piece 6").
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { campaignsQueryKeys } from "./campaigns"

const PROMOTIONS_QUERY_KEY = "promotions" as const
export const promotionsQueryKeys = {
  ...queryKeysFactory(PROMOTIONS_QUERY_KEY),
  // TODO: handle invalidations properly
  listRules: (
    id: string | null,
    ruleType: string,
    query?: HttpTypes.AdminGetPromotionRuleParams
  ) => [PROMOTIONS_QUERY_KEY, id, ruleType, query],
  listRuleAttributes: (
    ruleType: string,
    promotionType?: string,
    applicationMethodTargetType?: string
  ) => [
    PROMOTIONS_QUERY_KEY,
    ruleType,
    promotionType,
    applicationMethodTargetType,
  ],
  listRuleValues: (
    ruleType: string,
    ruleValue: string,
    query: HttpTypes.AdminGetPromotionsRuleValueParams
  ) => [PROMOTIONS_QUERY_KEY, ruleType, ruleValue, query],
}

export const usePromotion = (
  id: string,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminPromotionResponse,
      FetchError,
      HttpTypes.AdminPromotionResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: promotionsQueryKeys.detail(id),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>(`/tenants/promotions/${id}`),
    ...options,
  })

  return { ...data, ...rest }
}

export const usePromotionRules = (
  id: string | null,
  ruleType: string,
  query?: HttpTypes.AdminGetPromotionRuleParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminPromotionRuleListResponse,
      FetchError,
      HttpTypes.AdminPromotionRuleListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: promotionsQueryKeys.listRules(id, ruleType, query),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminPromotionRuleListResponse>(
        `/tenants/promotions/${id}/${ruleType}`,
        { query }
      ),
    ...options,
  })

  return { ...data, ...rest }
}

export const usePromotions = (
  query?: HttpTypes.AdminGetPromotionsParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminPromotionListResponse,
      FetchError,
      HttpTypes.AdminPromotionListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: promotionsQueryKeys.list(query),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminPromotionListResponse>("/tenants/promotions", {
        query,
      }),
    ...options,
  })

  return { ...data, ...rest }
}

export const usePromotionRuleAttributes = (
  ruleType: string,
  promotionType?: string,
  applicationMethodTargetType?: string,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminRuleAttributeOptionsListResponse,
      FetchError,
      HttpTypes.AdminRuleAttributeOptionsListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: promotionsQueryKeys.listRuleAttributes(
      ruleType,
      promotionType,
      applicationMethodTargetType
    ),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminRuleAttributeOptionsListResponse>(
        `/tenants/promotions/rule-attribute-options/${ruleType}`,
        {
          query: {
            promotion_type: promotionType,
            application_method_target_type: applicationMethodTargetType,
          },
        }
      ),
    ...options,
  })

  return { ...data, ...rest }
}

export const usePromotionRuleValues = (
  ruleType: string,
  ruleValue: string,
  query?: HttpTypes.AdminGetPromotionsRuleValueParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminRuleValueOptionsListResponse,
      FetchError,
      HttpTypes.AdminRuleValueOptionsListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: promotionsQueryKeys.listRuleValues(
      ruleType,
      ruleValue,
      query || {}
    ),
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminRuleValueOptionsListResponse>(
        `/tenants/promotions/rule-value-options/${ruleType}/${ruleValue}`,
        { query }
      ),
    ...options,
  })

  return { ...data, ...rest }
}

export const useDeletePromotion = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.DeleteResponse<"promotion">,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.DeleteResponse<"promotion">>(
        `/tenants/promotions/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: promotionsQueryKeys.detail(id),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useCreatePromotion = (
  options?: UseMutationOptions<
    HttpTypes.AdminPromotionResponse,
    FetchError,
    HttpTypes.AdminCreatePromotion
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>("/tenants/promotions", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: campaignsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdatePromotion = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPromotionResponse,
    FetchError,
    HttpTypes.AdminUpdatePromotion
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>(`/tenants/promotions/${id}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.all })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const usePromotionAddRules = (
  id: string,
  ruleType: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPromotionResponse,
    FetchError,
    HttpTypes.BatchAddPromotionRulesReq
  >
) => {
  return useMutation({
    // The three rule mutations share one route (`:id/:ruleType/batch`) and differ
    // only in which key of the batch body they fill, exactly as the js-sdk does.
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>(
        `/tenants/promotions/${id}/${ruleType}/batch`,
        { method: "POST", body: { create: payload.rules } }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.all })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const usePromotionRemoveRules = (
  id: string,
  ruleType: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPromotionResponse,
    FetchError,
    HttpTypes.BatchRemovePromotionRulesReq
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>(
        `/tenants/promotions/${id}/${ruleType}/batch`,
        { method: "POST", body: { delete: payload.rule_ids } }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.all })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const usePromotionUpdateRules = (
  id: string,
  ruleType: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPromotionResponse,
    FetchError,
    HttpTypes.BatchUpdatePromotionRulesReq
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<HttpTypes.AdminPromotionResponse>(
        `/tenants/promotions/${id}/${ruleType}/batch`,
        { method: "POST", body: { update: payload.rules } }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: promotionsQueryKeys.all })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
