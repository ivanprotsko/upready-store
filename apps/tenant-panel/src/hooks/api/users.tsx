import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { HttpTypes } from "@medusajs/types"
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
  /**
   * t-2026-10-07-11: the login's role in this shop and what it may open. The
   * panel reads `permissions` and nothing else to decide what to draw
   * (`lib/permissions.ts`); a server without roles sends neither field.
   */
  role?: string
  permissions?: string[]
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
    // t-2026-09-27-05: the platform tariff this shop was created on
    // (`novice`/`pro`/`master`) and, for a paid tariff, when its trial ends.
    // Null for a tenant created before this column existed, or with no
    // tariff at all.
    plan_id: string | null
    plan_trial_ends_at: string | null
  }
}

export type TenantMeResponse = { user: TenantAdmin }

const USERS_QUERY_KEY = "users" as const
const usersQueryKeys = {
  ...queryKeysFactory(USERS_QUERY_KEY),
  me: () => [USERS_QUERY_KEY, "me"].filter((k) => !!k),
}

/**
 * The «who am I» read as query options, so the route guard asks for the same
 * cached answer `useMe` renders from (`lib/caller-may-open.ts`).
 */
export const meQueryOptions = () => ({
  queryFn: async (): Promise<TenantMeResponse> => {
    const { tenant_admin } = await sdk.client.fetch<{
      tenant_admin: TenantAdmin
    }>("/tenants/me")

    return { user: tenant_admin }
  },
  queryKey: usersQueryKeys.me(),
})

export const useMe = (
  options?: Omit<
    UseQueryOptions<TenantMeResponse, FetchError, TenantMeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    ...meQueryOptions(),
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

// tenant-panel: wave 2, piece 2. `components/common/user-link` (copied verbatim
// for the order timeline) resolves an actor id: `user_*` is a staff user,
// `cus_*` a customer. A tenant panel has no staff-user directory and must not
// get one, so there is no `/tenants/users/:id` route and this hook resolves to
// nothing without a request. `By` renders null when the actor is undefined,
// which is what a tenant should see for an action a staff member took.
//
// Tenant-admin actor ids carry neither prefix, so `By` already renders null for
// the panel's own actions; this hook exists for the `user_*` branch alone.
export const useUser = (
  _id: string,
  _query?: Record<string, any>,
  _options?: { enabled?: boolean }
) => {
  return { user: undefined as HttpTypes.AdminUser | undefined }
}
