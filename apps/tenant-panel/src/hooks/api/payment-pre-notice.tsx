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

// Предупреждение перед оплатой (rule 5zd, t-2026-10-03-32): по одному набору
// полей на способ оплаты — валюта списания, иностранная карта, куда уходит
// оплата, источник курса и условия возврата. `PUT` всегда называет один
// `provider_key` и меняет только его поля.

export const PAYMENT_PRE_NOTICE_PROVIDER_KEYS = ["robokassa", "tribute", "btcpay", "manual", "card"] as const
export type PaymentPreNoticeProviderKey = (typeof PAYMENT_PRE_NOTICE_PROVIDER_KEYS)[number]

export const PAYMENT_PRE_NOTICE_REDIRECT_KINDS = [
  "domain",
  "telegram_bot",
  "crypto_network",
  "bank",
] as const
export type PaymentPreNoticeRedirectKind = (typeof PAYMENT_PRE_NOTICE_REDIRECT_KINDS)[number]

export type PaymentPreNoticeEntry = {
  charge_currency_code: string | null
  is_foreign_card: boolean
  redirect_kind: PaymentPreNoticeRedirectKind | null
  redirect_value: string | null
  rate_source: string | null
  refund_terms: string | null
}

export type TenantPaymentPreNotice = Record<PaymentPreNoticeProviderKey, PaymentPreNoticeEntry>

export const EMPTY_PRE_NOTICE_ENTRY: PaymentPreNoticeEntry = {
  charge_currency_code: null,
  is_foreign_card: false,
  redirect_kind: null,
  redirect_value: null,
  rate_source: null,
  refund_terms: null,
}

export type PutTenantPaymentPreNoticeBody = { provider_key: PaymentPreNoticeProviderKey } & Partial<
  Omit<PaymentPreNoticeEntry, never>
>

type PaymentPreNoticeResponse = { payment_pre_notice: TenantPaymentPreNotice }

const PAYMENT_PRE_NOTICE_QUERY_KEY = "payment-pre-notice" as const
export const paymentPreNoticeQueryKeys = queryKeysFactory(PAYMENT_PRE_NOTICE_QUERY_KEY)

const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: paymentPreNoticeQueryKeys.all })

export const useTenantPaymentPreNotice = (
  options?: Omit<
    UseQueryOptions<PaymentPreNoticeResponse, FetchError, PaymentPreNoticeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: paymentPreNoticeQueryKeys.details(),
    queryFn: () =>
      sdk.client.fetch<PaymentPreNoticeResponse>("/tenants/payment-settings/pre-notice"),
    ...options,
  })

  return { paymentPreNotice: data?.payment_pre_notice, ...rest }
}

export const useUpdateTenantPaymentPreNotice = (
  options?: UseMutationOptions<PaymentPreNoticeResponse, FetchError, PutTenantPaymentPreNoticeBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<PaymentPreNoticeResponse>("/tenants/payment-settings/pre-notice", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
