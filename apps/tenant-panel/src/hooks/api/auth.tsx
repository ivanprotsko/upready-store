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
// `useSignUpWithEmailPass` and `useUpdateProviderForEmailPass` stay dropped:
// no SSO/cloud auth and no self-signup in the panel.
// `useGenerateResetPasswordToken` and `useResetPasswordForEmailPass`
// (f14-no-password-reset) are the tenant equivalents of the Admin's own
// reset-password hooks, backing `routes/forgot-password` and
// `routes/reset-password`.

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

/**
 * `POST /auth/tenant/emailpass/reset-password` (f14-no-password-reset).
 * Medusa answers regardless of whether the address has a `tenant` identity,
 * and only emits `auth.password_reset` (picked up by
 * `subscribers/password-reset-email.ts`) when one exists — so this hook never
 * tells the caller whether the account is real.
 */
export const useGenerateResetPasswordToken = (
  options?: UseMutationOptions<
    void,
    FetchError,
    { email: string; metadata?: Record<string, unknown> }
  >
) => {
  return useMutation({
    mutationFn: ({ email, metadata }) =>
      sdk.auth.resetPassword("tenant", "emailpass", {
        identifier: email,
        metadata,
      }),
    ...options,
  })
}

/**
 * `POST /auth/tenant/emailpass/update`, bearer-authenticated with the token
 * from the reset-password email link (f14-no-password-reset).
 */
export const useResetPasswordForEmailPass = (
  options?: UseMutationOptions<
    void,
    FetchError,
    { password: string; token: string }
  >
) => {
  return useMutation({
    mutationFn: ({ password, token }) =>
      sdk.auth.updateProvider("tenant", "emailpass", { password }, token),
    ...options,
  })
}

export type MailStatus = { configured: boolean; contact_email: string }

/**
 * `GET /auth/tenant/mail-status` — a public, pre-auth read of whether this
 * deployment's platform-wide SMTP account is set at all (f14-no-password-reset).
 * Backs the honest dead-end on `routes/forgot-password`: without it, a form
 * that always answers "email sent" would lie on every stand and every MT
 * deployment that has not configured `SMTP_HOST`
 * (`deploy/mt/shipshift.env.example`).
 */
export const useMailStatus = (
  options?: Omit<
    UseQueryOptions<MailStatus, FetchError>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: ["auth", "mail-status"] as const,
    queryFn: () => sdk.client.fetch<MailStatus>("/auth/tenant/mail-status"),
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}
