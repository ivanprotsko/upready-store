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

// t-2026-09-24-n12: «Настройки → Сайты». `GET /tenants/sites` lists the sites
// of the owner's client, `POST /tenants/sites` makes a new one as a copy of
// the current site (`apps/backend/src/workflows/tenant/clone-tenant`). The
// owner never sees the word «группа»: these are «мои сайты».

export type SiteCertificate = {
  status: "valid" | "invalid" | "unreachable"
  valid_to: string | null
}

export type TenantSite = {
  id: string
  name: string
  handle: string
  is_current: boolean
  primary_host: string
  technical_hosts: string[]
  domains: { host: string; is_primary: boolean; certificate: SiteCertificate }[]
}

export type CreateSiteBody = {
  name: string
  handle: string
  copy_pages: boolean
  copy_shipping: boolean
}

const SITES_QUERY_KEY = "tenant-sites" as const
export const sitesQueryKeys = queryKeysFactory(SITES_QUERY_KEY)

export const useSites = (
  options?: Omit<
    UseQueryOptions<{ sites: TenantSite[] }, FetchError, { sites: TenantSite[] }, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<{ sites: TenantSite[] }>("/tenants/sites"),
    queryKey: sitesQueryKeys.lists(),
    ...options,
  })

  return { sites: data?.sites, ...rest }
}

export const useCreateSite = (
  options?: UseMutationOptions<{ site: { id: string; handle: string } }, FetchError, CreateSiteBody>
) => {
  return useMutation({
    mutationFn: (body) =>
      sdk.client.fetch<{ site: { id: string; handle: string } }>("/tenants/sites", {
        method: "POST",
        body,
      }),
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: sitesQueryKeys.all })
      // The header's shop switcher reads the same sites.
      await queryClient.invalidateQueries({ queryKey: ["tenant-shops"] })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
