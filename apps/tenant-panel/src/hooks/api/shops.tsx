import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// o25-platform-admin-all-shops: `GET /tenants/me/shops` + `POST
// /tenants/me/switch`. One emailpass identity — the platform admin
// (`PLATFORM_ADMIN_EMAIL`) chief among them — can hold a `tenant_admin` row
// in several shops; the header's switcher moves the session between them
// without a second login. Own hook file, no Admin counterpart: a staff Admin
// `user` has no notion of "shops" at all.

export type TenantShop = { id: string; name: string; handle: string }

const SHOPS_QUERY_KEY = "tenant-shops" as const
const shopsQueryKeys = queryKeysFactory(SHOPS_QUERY_KEY)

export const useMyShops = (
  options?: Omit<
    UseQueryOptions<
      { shops: TenantShop[] },
      FetchError,
      { shops: TenantShop[] },
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<{ shops: TenantShop[] }>("/tenants/me/shops"),
    queryKey: shopsQueryKeys.lists(),
    ...options,
  })

  return { shops: data?.shops, ...rest }
}

/**
 * `POST /tenants/me/switch` answers a bare `{ token }`, not a login response
 * the SDK's own `sdk.auth.login` would store for us. This converts it the
 * SAME way `@medusajs/js-sdk`'s `Auth#setToken_` does for session-based auth
 * (`lib/client/client.ts`, `__AUTH_TYPE__` is always `"session"` in this
 * panel, `vite.config.mts`): `POST /auth/session` with the new token as a
 * bearer header, which the backend turns into the session cookie every
 * later request reads. `sdk.auth.login` calls the same private method
 * internally; this panel is not allowed to reach past its `.d.ts` for it, so
 * the one line it hides is repeated here instead.
 */
export const useSwitchShop = (
  options?: UseMutationOptions<void, FetchError, { tenant_id: string }>
) => {
  return useMutation({
    mutationFn: async ({ tenant_id }) => {
      const { token } = await sdk.client.fetch<{ token: string }>(
        "/tenants/me/switch",
        { method: "POST", body: { tenant_id } }
      )

      await sdk.client.fetch("/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    ...options,
  })
}
