import { AuthLoginResponse, FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import {
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"

// tenant-panel: tenant equivalent of the Admin's hooks/api/auth.tsx, scoped to
// the `tenant` actor type instead of `user`. `provisionAuthUser`,
// `useResetPasswordForEmailPass`, `useSignUpWithEmailPass` and
// `useUpdateProviderForEmailPass` are dropped: nothing copied into the panel
// (login.tsx has no reset-password link, no SSO/cloud auth) imports them.

/**
 * Public information about an auth provider registered for the `tenant`
 * actor, as returned by `GET /auth/tenant/providers`.
 */
export type AuthProvider = HttpTypes.AuthProvider

export const authProvidersQueryKey = ["auth", "providers"] as const

/**
 * Fetches the auth providers available for the `tenant` actor. Public,
 * pre-auth endpoint, so no authenticated session is required.
 */
export const useAuthProviders = (
  options?: Omit<
    UseQueryOptions<HttpTypes.AuthProvidersListResponse, FetchError>,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: authProvidersQueryKey,
    queryFn: async () => sdk.auth.listProviders("tenant"),
    staleTime: 5 * 60 * 1000,
    ...options,
  })

  return { ...data, ...rest }
}

export const useSignInWithEmailPass = (
  options?: UseMutationOptions<
    AuthLoginResponse,
    FetchError,
    HttpTypes.AdminSignUpWithEmailPassword
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.auth.login(
        "tenant",
        "emailpass",
        payload
      ) as Promise<AuthLoginResponse>,
    onSuccess: async (data, variables, context) => {
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useLogout = (options?: UseMutationOptions<void, FetchError>) => {
  return useMutation({
    mutationFn: () => sdk.auth.logout(),
    ...options,
  })
}
