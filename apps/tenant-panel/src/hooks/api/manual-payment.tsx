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

// Оплата вне шлюза (olavka-payments): кошельки для крипты и контакты
// менеджера для «картой через менеджера». Оба способа живут на встроенном
// `pp_system_default`; заказ остаётся «ждёт оплаты», пока владелец не
// подтвердит её в панели. Свой хук панели, у Admin аналога нет.

export type ManualPaymentWallet = {
  network: string
  currency: string
  address: string
}

// Карта для перевода: показывается покупателю до контактов менеджера.
export type ManualPaymentCard = {
  bank: string
  number: string
  holder: string | null
}

export type TenantManualPayment = {
  crypto: {
    enabled: boolean
    wallets: ManualPaymentWallet[]
  }
  manager: {
    enabled: boolean
    cards: ManualPaymentCard[]
    whatsapp: string | null
    telegram: string | null
    email: string | null
    note: string | null
  }
}

export type PutTenantManualPaymentBody = Partial<TenantManualPayment>

type ManualPaymentResponse = { manual_payment: TenantManualPayment }

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

  return { manualPayment: data?.manual_payment, ...rest }
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
