import { FetchError } from "@medusajs/js-sdk"
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

// t09-reviews: product reviews. No Admin counterpart — a native Medusa install
// has no reviews at all — so this module is the panel's own, in the shape every
// other hooks/api module here has (queryKeysFactory + sdk.client.fetch +
// invalidation on success). Routes: GET/POST/DELETE /tenants/reviews[/:id].

export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export type ReviewSource = "shop" | "imported"

export type TenantReview = {
  id: string
  product_id: string
  author_name: string
  rating: number
  title: string | null
  body: string
  language: string
  status: ReviewStatus
  source: ReviewSource
  reply: string | null
  replied_at: string | null
  /**
   * When the review was written; an imported one keeps the old shop's date.
   * `null` where the source carried a date nothing could read — the list shows
   * no date then, never the day it was imported.
   */
  written_at: string | null
  created_at: string
  product: {
    id: string
    title: string
    handle: string
    thumbnail: string | null
  } | null
}

export type TenantReviewListResponse = {
  reviews: TenantReview[]
  count: number
  offset: number
  limit: number
}

export type TenantReviewResponse = { review: TenantReview }

export type TenantReviewListQuery = {
  status?: ReviewStatus
  product_id?: string
  language?: string
  limit?: number
  offset?: number
}

export type UpdateTenantReviewBody = {
  status?: ReviewStatus
  reply?: string | null
}

const REVIEWS_QUERY_KEY = "tenant-reviews" as const
export const reviewsQueryKeys = queryKeysFactory(REVIEWS_QUERY_KEY)

const buildQuery = (query: TenantReviewListQuery): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

export const useTenantReviews = (
  query: TenantReviewListQuery = {},
  options?: Omit<
    UseQueryOptions<
      TenantReviewListResponse,
      FetchError,
      TenantReviewListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantReviewListResponse>(`/tenants/reviews${buildQuery(query)}`),
    queryKey: reviewsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantReview = (
  id: string,
  options?: UseMutationOptions<TenantReviewResponse, FetchError, UpdateTenantReviewBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantReviewResponse>(`/tenants/reviews/${id}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteTenantReview = (
  options?: UseMutationOptions<{ id: string; deleted: boolean }, FetchError, string>
) => {
  return useMutation({
    mutationFn: (id) =>
      sdk.client.fetch<{ id: string; deleted: boolean }>(`/tenants/reviews/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: reviewsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
