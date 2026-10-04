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
import { marketplaceSectionQueryKeys } from "./marketplace-section"

// «Маркетплейсы → Отзывы» (w18-mp-reviews-desk). Свой хук панели, у Admin
// аналога нет.
//
// Читает нормализованные таблицы `mp_review` / `mp_question`, пишет ровно одно
// поле — черновик ответа в НАШЕЙ базе. Отправки ответа на площадку здесь нет и
// в платформе её нет вовсе: ответ на отзыв — это запись, а обе площадки у нас
// только на чтение (приказ Ивана 2026-09-16 02:46 WITA). Поэтому в хуке нет ни
// одной мутации, кроме `draft` и `suggest`, и «sending» приезжает с бэкенда
// выключенным вместе с причиной.

export type DeskKind = "reviews" | "questions"

export type DeskProductLink = {
  vendor_code: string | null
  /** Заголовок карточки НА площадке, если карточка импортирована. */
  mp_title: string | null
  mp_external_id: string | null
  /** Товар магазина, если сопоставитель связал карточку. */
  product_id: string | null
  product_title: string | null
  linked: boolean
}

export type DeskItem = {
  id: string
  kind: DeskKind
  marketplace: string
  external_id: string
  rating: number | null
  text: string | null
  pros: string | null
  cons: string | null
  author: string | null
  created_at: string | null
  /** Что о наличии ответа говорит ПЛОЩАДКА, а не наш черновик. */
  is_answered: boolean
  answer_draft: string | null
  answer_draft_at: string | null
  product: DeskProductLink
}

export type DeskCounts = { total: number; unanswered: number; filtered: number }

export type DeskGenerator = {
  available: boolean
  id: string | null
  reason: string
  remote: false
}

export type DeskFilters = {
  marketplace: string | null
  rating: number | null
  answered: "all" | "no" | "yes"
  period: string
  applied: Array<{ field: string; value: string }>
}

export type DeskResponse = {
  kind: DeskKind
  items: DeskItem[]
  count: number
  limit: number
  offset: number
  filters: DeskFilters
  counts: Record<DeskKind, DeskCounts>
  marketplaces: string[]
  generator: DeskGenerator
  sending: { enabled: false; reason: string }
}

export type DeskQuery = {
  marketplace?: string | null
  rating?: number | null
  answered?: "all" | "no" | "yes"
  period?: string
}

const DESK_QUERY_KEY = "tenant-marketplace-desk" as const
export const deskQueryKeys = queryKeysFactory(DESK_QUERY_KEY)

/**
 * Both lists that show a draft: the w18 desk and «Wildberries → Отзывы» of
 * the marketplace section, so the row's dot turns «Черновик ответа» after a
 * save without a reload.
 */
const invalidate = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: deskQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: marketplaceSectionQueryKeys.lists() }),
  ])

const toSearch = (query: DeskQuery): string => {
  const params = new URLSearchParams()
  if (query.marketplace) {
    params.set("marketplace", query.marketplace)
  }
  if (query.rating) {
    params.set("rating", String(query.rating))
  }
  if (query.answered && query.answered !== "all") {
    params.set("answered", query.answered)
  }
  if (query.period && query.period !== "all") {
    params.set("period", query.period)
  }
  const search = params.toString()
  return search ? `?${search}` : ""
}

export const useMarketplaceDesk = (
  kind: DeskKind,
  query: DeskQuery,
  options?: Omit<
    UseQueryOptions<DeskResponse, FetchError, DeskResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<DeskResponse>(`/tenants/marketplaces/${kind}${toSearch(query)}`),
    queryKey: deskQueryKeys.detail(`${kind}${toSearch(query)}`),
    ...options,
  })

  // Именовано `desk`, а не разложено в `...rest`: у результата react-query есть
  // собственные поля `status` и `count`-подобные, и ответ с тем же именем
  // перетёрся бы ими (та же ловушка, что в `marketplaces.tsx`).
  return { desk: data, ...rest }
}

export type SaveDraftPayload = { kind: DeskKind; id: string; answer_draft: string }

/**
 * `POST /tenants/marketplaces/{kind}/:id/draft` — сохранить или очистить
 * черновик. Пустая строка очищает: владелица стёрла текст, значит он ей не
 * нужен, и метка времени вместе с ним.
 */
export const useSaveDraft = (
  options?: UseMutationOptions<
    { item: { id: string; answer_draft: string | null; answer_draft_at: string | null } },
    FetchError,
    SaveDraftPayload
  >
) =>
  useMutation({
    // `options` first: the caller's own `onSuccess` is called from ours, and
    // spread last it would replace ours and skip the refresh of the lists.
    ...options,
    mutationFn: ({ kind, id, answer_draft }) =>
      sdk.client.fetch(`/tenants/marketplaces/${kind}/${id}/draft`, {
        method: "POST",
        body: { answer_draft },
      }),
    onSuccess: async (data, variables, context) => {
      await invalidate()
      options?.onSuccess?.(data, variables, context)
    },
  })

/**
 * `POST /tenants/marketplaces/{kind}/:id/suggest` — составить черновик
 * локальным шаблоном. Ничего не сохраняет: текст возвращается в поле ввода, и
 * сохраняет его владелица сама.
 */
export const useSuggestDraft = (
  options?: UseMutationOptions<
    { draft: string; generator: DeskGenerator },
    FetchError,
    { kind: DeskKind; id: string }
  >
) =>
  useMutation({
    mutationFn: ({ kind, id }) =>
      sdk.client.fetch<{ draft: string; generator: DeskGenerator }>(
        `/tenants/marketplaces/${kind}/${id}/suggest`,
        { method: "POST", body: {} }
      ),
    ...options,
  })
