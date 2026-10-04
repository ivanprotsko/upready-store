import { FetchError } from "@medusajs/js-sdk"
import { UseMutationOptions, useMutation } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { marketplaceSectionQueryKeys } from "./marketplace-section"

// «Маркетплейсы → Отзывы» (w18-mp-reviews-desk). Свой хук панели, у Admin
// аналога нет. С mp-section-design здесь только типы отзыва и мутации
// черновика: список «Wildberries → Отзывы» — `useMpReviews` в
// marketplace-section.tsx, ленты w18 больше нет.
//
// Пишет ровно одно поле — черновик ответа в НАШЕЙ базе. Отправки ответа на площадку здесь нет и
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

export type DeskGenerator = {
  available: boolean
  id: string | null
  reason: string
  remote: false
}

/**
 * The list that shows a draft, «Wildberries → Отзывы» of the marketplace
 * section, so the row's dot turns «Черновик ответа» after a save without a
 * reload.
 */
const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: marketplaceSectionQueryKeys.lists() })

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
