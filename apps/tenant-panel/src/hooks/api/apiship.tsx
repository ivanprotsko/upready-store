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

// The shop's ApiShip token (p01-settings-integrations-restructure). The panel's
// own hook, no Admin counterpart. TWO queries on purpose: the stored state
// comes from our own database and renders the form instantly, and whether
// ApiShip ACCEPTS the token is a call to ApiShip that must not hold the screen
// (rule 19h — while it is in flight the page says so, it does not invent a
// verdict).

export type MaskedSecret = { set: boolean; last4: string | null }

export type ApishipSettings = {
  id: string
  is_enabled: boolean
  token: MaskedSecret
}

export type ApishipKeyResponse = {
  provider: "apiship"
  label: string
  /** `null` until the owner saves a token. */
  settings: ApishipSettings | null
}

export type ApishipProbeResponse = {
  token_set: boolean
  /** `null` when no token is stored — «не спрошено», not «не принят». */
  probe: {
    ok: boolean
    /** The HTTP status ApiShip answered with; `null` when it never answered. */
    status: number | null
    connections: number | null
    error: string | null
  } | null
}

export type PutApishipKeyBody = { token: string; is_enabled?: boolean }

const APISHIP_QUERY_KEY = "tenant-apiship" as const
export const apishipQueryKeys = queryKeysFactory(APISHIP_QUERY_KEY)

export const useApishipKey = (
  options?: Omit<
    UseQueryOptions<ApishipKeyResponse, FetchError, ApishipKeyResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.details(),
    queryFn: () => sdk.client.fetch<ApishipKeyResponse>("/tenants/apiship/key"),
    ...options,
  })

  return { apiship: data, ...rest }
}

export const useApishipProbe = (
  options?: Omit<
    UseQueryOptions<ApishipProbeResponse, FetchError, ApishipProbeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.detail("probe"),
    queryFn: () => sdk.client.fetch<ApishipProbeResponse>("/tenants/apiship/probe"),
    // The probe costs a call to ApiShip, so it is not refetched on every focus
    // the way a database read can be.
    staleTime: 60_000,
    ...options,
  })

  return { result: data, ...rest }
}

export const useSaveApishipKey = (
  options?: UseMutationOptions<ApishipKeyResponse, FetchError, PutApishipKeyBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ApishipKeyResponse>("/tenants/apiship/key", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // The whole key, probe included: a new token makes the old verdict a
      // claim about a credential that is gone.
      queryClient.invalidateQueries({ queryKey: apishipQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteApishipKey = (
  options?: UseMutationOptions<ApishipKeyResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<ApishipKeyResponse>("/tenants/apiship/key", { method: "DELETE" }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: apishipQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
