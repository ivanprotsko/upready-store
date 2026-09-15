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

// Реквизиты продавца (t12-legal-requisites): значения, которыми на витрине
// заполняются {{ТОКЕНЫ}} в оферте, политике конфиденциальности и контактах.
// Свой хук панели, у Admin аналога нет — там один магазин, и его реквизиты не
// подставляются никуда автоматически.

export type Requisites = {
  legal_name: string | null
  inn: string | null
  ogrn: string | null
  legal_address: string | null
  return_address: string | null
  phone: string | null
  phone_confirmed: boolean
  email: string | null
  dpo_email: string | null
  delivery_methods: string | null
  effective_date: string | null
  revision_date: string | null
  document_date: string | null
  rkn_notice_date: string | null
  rkn_reg_number: string | null
  newsletter_management_url: string | null
  bank_details: string | null
}

export type MissingRequisite = {
  token: string
  label: string
  pages: { key: string; title: string }[]
}

export type RequisitesResponse = {
  requisites: Requisites
  /** {{ДОМЕН_САЙТА}} — read-only, resolved from the shop's own primary address. */
  domain: string
  missing: MissingRequisite[]
}

export type PutRequisitesBody = Partial<Requisites>

const REQUISITES_QUERY_KEY = "requisites" as const
export const requisitesQueryKeys = queryKeysFactory(REQUISITES_QUERY_KEY)

export const useRequisites = (
  options?: Omit<
    UseQueryOptions<RequisitesResponse, FetchError, RequisitesResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: requisitesQueryKeys.details(),
    queryFn: () => sdk.client.fetch<RequisitesResponse>("/tenants/requisites"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateRequisites = (
  options?: UseMutationOptions<RequisitesResponse, FetchError, PutRequisitesBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<RequisitesResponse>("/tenants/requisites", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: requisitesQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
