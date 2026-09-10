import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: tenant equivalent of the Admin's hooks/api/users.tsx. The
// Admin's `useMe` calls `GET /admin/users/me`, which already returns
// `{ user }`. The tenant contract's `GET /tenants/me` returns
// `{ tenant_admin }` instead (docs/tenant-panel/api-contract.md), so this
// hook remaps that field to `user` here, once, so every copied screen that
// reads `user.first_name`/`user.email`/... off `useMe()` keeps working
// unchanged.

export type TenantAdmin = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  /**
   * Not part of the tenant contract's `GET /tenants/me` response; the copied
   * `components/layout/user-menu` reads it optionally (`avatar || undefined`)
   * the same way it does for the Admin's own users.
   */
  avatar_url?: string | null
  tenant: {
    id: string
    handle: string
    name: string
    metadata: Record<string, unknown> | null
    sales_channel: { id: string; name: string; is_disabled: boolean } | null
    api_key: {
      id: string
      token: string
      redacted: string
      title: string
      type: string
    } | null
  }
}

export type TenantMeResponse = { user: TenantAdmin }

const USERS_QUERY_KEY = "users" as const
const usersQueryKeys = {
  ...queryKeysFactory(USERS_QUERY_KEY),
  me: () => [USERS_QUERY_KEY, "me"].filter((k) => !!k),
}

export const useMe = (
  options?: Omit<
    UseQueryOptions<TenantMeResponse, FetchError, TenantMeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () => {
      const { tenant_admin } = await sdk.client.fetch<{
        tenant_admin: TenantAdmin
      }>("/tenants/me")

      return { user: tenant_admin }
    },
    queryKey: usersQueryKeys.me(),
    ...options,
  })

  return { ...data, ...rest }
}
