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
import type { MaskedSecret } from "./apiship"

// The shop's Russian Post «Отправка» access (46df-pochta). Same two-query shape
// as ApiShip: the stored state renders the form from our own database, and the
// carrier's verdict is its own query that never holds the screen.

export type PochtaSettings = {
  id: string
  is_enabled: boolean
  token: MaskedSecret
  user_key: MaskedSecret
  sender_index: string
  default_weight_g: number
}

export type PochtaResponse = {
  provider: "pochta"
  label: string
  /** `null` until the owner saves the form once. */
  settings: PochtaSettings | null
  /** The «Почта России — до отделения» option, once provisioned. */
  method: { id: string; name: string; enabled: boolean } | null
  verified?: { points: number } | null
}

export type PochtaProbeResponse = {
  token_set: boolean
  user_key_set: boolean
  probe: {
    ok: boolean
    status: number | null
    points: number | null
    user_key: { ok: boolean; status: number | null; error: string | null } | null
    error: string | null
  } | null
}

export type PutPochtaBody = {
  token?: string
  user_key?: string
  clear_user_key?: boolean
  sender_index?: string
  default_weight_g?: number
  is_enabled?: boolean
}

const POCHTA_QUERY_KEY = "tenant-pochta" as const
export const pochtaQueryKeys = queryKeysFactory(POCHTA_QUERY_KEY)

export const usePochta = (
  options?: Omit<UseQueryOptions<PochtaResponse, FetchError, PochtaResponse, QueryKey>, "queryFn" | "queryKey">
) => {
  const { data, ...rest } = useQuery({
    queryKey: pochtaQueryKeys.details(),
    queryFn: () => sdk.client.fetch<PochtaResponse>("/tenants/pochta"),
    ...options,
  })
  return { pochta: data, ...rest }
}

export const usePochtaProbe = (
  options?: Omit<
    UseQueryOptions<PochtaProbeResponse, FetchError, PochtaProbeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: pochtaQueryKeys.detail("probe"),
    queryFn: () => sdk.client.fetch<PochtaProbeResponse>("/tenants/pochta/probe"),
    staleTime: 60_000,
    ...options,
  })
  return { result: data, ...rest }
}

export const useSavePochta = (options?: UseMutationOptions<PochtaResponse, FetchError, PutPochtaBody>) =>
  useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<PochtaResponse>("/tenants/pochta", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pochtaQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useDeletePochta = (options?: UseMutationOptions<PochtaResponse, FetchError, void>) =>
  useMutation({
    mutationFn: () => sdk.client.fetch<PochtaResponse>("/tenants/pochta", { method: "DELETE" }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pochtaQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
