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

// Оплата вне шлюза (olavka-payments): перевод по реквизитам на встроенном
// `pp_system_default`; заказ остаётся «ждёт оплаты», пока владелец не
// подтвердит её в панели. Свой хук панели, у Admin аналога нет.
//
// t-cherk-com-hotfix batch 6: один упорядоченный список реквизитов (банк или
// криптокошелёк), один выключатель на весь способ и контакты менеджера.
// Значки — пресеты бэкенда (`presets` в ответе), файлы в `public/payment-icons`.

export type BankRequisite = {
  id?: string
  kind: "bank"
  icon: string | null
  bank: string
  number: string
  holder: string | null
}

export type CryptoRequisite = {
  id?: string
  kind: "crypto"
  currency: string
  network: string
  address: string
}

export type PaymentRequisite = BankRequisite | CryptoRequisite

export type ManualPaymentContacts = {
  whatsapp: string | null
  telegram: string | null
  email: string | null
  note: string | null
}

export type TenantManualPayment = {
  enabled: boolean
  requisites: PaymentRequisite[]
  contacts: ManualPaymentContacts
}

export type PaymentIconPreset = {
  key: string
  name: string
  country: string | null
  kind: "bank" | "crypto"
}

export type PutTenantManualPaymentBody = Partial<TenantManualPayment>

type ManualPaymentResponse = {
  manual_payment: TenantManualPayment
  presets: PaymentIconPreset[]
}

const MANUAL_PAYMENT_QUERY_KEY = "manual-payment" as const
export const manualPaymentQueryKeys = queryKeysFactory(MANUAL_PAYMENT_QUERY_KEY)

const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: manualPaymentQueryKeys.all })

export const useTenantManualPayment = (
  options?: Omit<
    UseQueryOptions<ManualPaymentResponse, FetchError, ManualPaymentResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: manualPaymentQueryKeys.details(),
    queryFn: () =>
      sdk.client.fetch<ManualPaymentResponse>("/tenants/payment-settings/manual"),
    ...options,
  })

  return { manualPayment: data?.manual_payment, presets: data?.presets ?? [], ...rest }
}

export const useUpdateTenantManualPayment = (
  options?: UseMutationOptions<ManualPaymentResponse, FetchError, PutTenantManualPaymentBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ManualPaymentResponse>("/tenants/payment-settings/manual", {
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
