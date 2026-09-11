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
  // tenant-panel wave 2, piece 4: the copied profile-edit form writes the
  // language choice here, as `metadata.language` (docs/tenant-panel/api-contract.md,
  // "Piece 4: profile").
  metadata?: Record<string, unknown> | null
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

// tenant-panel wave 2, piece 4: `POST /tenants/me` (no id in the route — the
// caller is always the tenant admin behind the bearer token). The copied
// `edit-profile-form` calls the Admin's `useUpdateUser(user.id!)`; here it is
// `useUpdateUser()`, one comment marking the one call-site change.
export type PostTenantUpdateMeBody = {
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown> | null
}

export const useUpdateUser = (
  options?: UseMutationOptions<TenantMeResponse, FetchError, PostTenantUpdateMeBody>
) => {
  return useMutation({
    mutationFn: async (payload) => {
      const { tenant_admin } = await sdk.client.fetch<{ tenant_admin: TenantAdmin }>(
        "/tenants/me",
        { method: "POST", body: payload }
      )

      return { user: tenant_admin }
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.me() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

// tenant-panel wave 2, piece 4: `POST /tenants/me/password`. Own hook, no
// Admin counterpart (the Admin only ever changes a password through the
// unauthenticated reset-password link flow).
export type PostTenantUpdatePasswordBody = {
  current_password: string
  new_password: string
}

export const useUpdatePassword = (
  options?: UseMutationOptions<{ ok: true }, FetchError, PostTenantUpdatePasswordBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<{ ok: true }>("/tenants/me/password", {
        method: "POST",
        body: payload,
      }),
    ...options,
  })
}
