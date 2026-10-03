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

// The shop's payment account (t03-tenant-secrets-robokassa): the panel's own
// hook, no Admin counterpart. Reads `/tenants/payment-settings`; every secret
// arrives masked as `{ set, last4 }` and the value never reaches the browser.

export type MaskedSecret = { set: boolean; last4: string | null }

export type RobokassaHashAlgorithm = "md5" | "sha256" | "sha384" | "sha512"

// t-cherk-30: Robokassa's own enums for the 54-FZ receipt (`Receipt`), read
// from docs.robokassa.ru/ru/fiscalization — `payment_method` and
// `payment_object` are not here because neither is a panel field (the brief
// fixes them: every line is `full_payment`, an item is `commodity`, shipping
// is `service`).
export const ROBOKASSA_SNO_VALUES = ["osn", "usn_income", "usn_income_outcome", "esn", "patent"] as const
export type RobokassaSno = (typeof ROBOKASSA_SNO_VALUES)[number]

export const ROBOKASSA_TAX_VALUES = [
  "none",
  "vat0",
  "vat10",
  "vat20",
  "vat110",
  "vat120",
  "vat5",
  "vat7",
  "vat105",
  "vat107",
  "vat22",
  "vat122",
] as const
export type RobokassaTax = (typeof ROBOKASSA_TAX_VALUES)[number]

export type PaymentSettings = {
  id: string
  provider: "robokassa"
  is_test: boolean
  is_enabled: boolean
  merchant_login: string
  hash_algorithm: RobokassaHashAlgorithm
  password1: MaskedSecret
  password2: MaskedSecret
  test_password1: MaskedSecret
  test_password2: MaskedSecret
  fiscalization_enabled: boolean
  sno: RobokassaSno
  default_tax: RobokassaTax
}

/**
 * Which payment methods the buyer sees right now (t-2026-09-24-n10): the
 * same resolver `/store/payment-providers` and `/storefront/by-host` use.
 * `demo` is `pp_system_default`'s test card, never a method the owner
 * "connects" — it is the fallback a shop with nothing else falls back on.
 */
export type TenantPaymentMethods = {
  robokassa: boolean
  manualCrypto: boolean
  manualManager: boolean
  demo: boolean
}

/**
 * A stored row the server cannot decrypt (46df D1): restored under another
 * encryption key or damaged. Nothing in it can be used or shown; the owner
 * enters the requisites again, or deletes the row.
 */
export type UnreadableSecret = {
  id: string
  provider: string
  is_test: boolean
  is_enabled: boolean
}

export type PaymentSettingsResponse = {
  /** `null` until the owner saves an account, and while the stored one is unreadable. */
  settings: PaymentSettings | null
  /** Set when a Robokassa row exists but does not decrypt. */
  unreadable: UnreadableSecret | null
  /** What to paste into Robokassa's «Result URL» field. */
  result_url: string
  providers: Array<{ id: "robokassa"; title: string }>
  methods: TenantPaymentMethods
}

export type PutPaymentSettingsBody = {
  provider: "robokassa"
  merchant_login: string
  hash_algorithm?: RobokassaHashAlgorithm
  is_test?: boolean
  is_enabled?: boolean
  /** Left out or empty: the stored value stays. */
  password1?: string
  password2?: string
  test_password1?: string
  test_password2?: string
  fiscalization_enabled?: boolean
  sno?: RobokassaSno
  default_tax?: RobokassaTax
}

const PAYMENT_SETTINGS_QUERY_KEY = "payment-settings" as const
export const paymentSettingsQueryKeys = queryKeysFactory(PAYMENT_SETTINGS_QUERY_KEY)

export const usePaymentSettings = (
  options?: Omit<
    UseQueryOptions<PaymentSettingsResponse, FetchError, PaymentSettingsResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: paymentSettingsQueryKeys.details(),
    queryFn: () => sdk.client.fetch<PaymentSettingsResponse>("/tenants/payment-settings"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdatePaymentSettings = (
  options?: UseMutationOptions<PaymentSettingsResponse, FetchError, PutPaymentSettingsBody>
) => {
  return useMutation({
    ...options,
    mutationFn: (payload) =>
      sdk.client.fetch<PaymentSettingsResponse>("/tenants/payment-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // The PUT answers with the state it just wrote. Put it in the cache at
      // once: waiting for the refetch left «не читается — введите заново» on
      // screen next to the «saved» toast for a whole GET (46df final walk).
      queryClient.setQueryData(paymentSettingsQueryKeys.details(), data)
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
}

export const useDeletePaymentSettings = (
  options?: UseMutationOptions<{ deleted: boolean }, FetchError, void>
) => {
  return useMutation({
    ...options,
    mutationFn: () =>
      sdk.client.fetch<{ deleted: boolean }>("/tenants/payment-settings", {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
}
