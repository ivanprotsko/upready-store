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

// tenant-panel: own hook file, no Admin counterpart — the «Отзывы и вопросы»
// tab of the Wildberries page (w22-wb-write-feedback-answers).
//
// Three calls and a clear split between them. The GET and the PUT touch our
// own draft column and can reach nothing outside this database. The POST is
// the only one that hands a payload to the marketplace write core, and it
// carries the per-answer confirmation: a sha256 of the exact text the dialog
// quoted, which the backend recomputes over the stored draft.
//
// Both mutations answer with the WHOLE state, so the cache is set from the
// response rather than refetched: what the screen shows next is what the
// server read back (rule 20a).

export type WbAnswerTarget = "feedback" | "question"

export type WbAnswerStatus = "draft" | "confirmed" | "sent" | "failed"

export type WbAnswerItem = {
  target: WbAnswerTarget
  /** WB's own id of the review or the question. */
  id: string
  nm_id: string | null
  product_title: string | null
  vendor_code: string | null
  rating: number | null
  text: string | null
  pros: string | null
  cons: string | null
  user_name: string | null
  is_answered: boolean
  was_viewed: boolean | null
  created_date: string | null
  draft_answer: string | null
  /** sha256 of the stored draft, computed by the backend. What send() confirms. */
  draft_sha256: string | null
  answer_status: WbAnswerStatus
  answer_confirmed_by: string | null
  answer_confirmed_at: string | null
  answer_error: string | null
  /** The answer WB already has, for a question. `null` for a review. */
  answer_text: string | null
}

export type WbAnswerBucket = {
  unanswered: number
  answered: number
  drafts: number
  rows: WbAnswerItem[]
}

export type WbAnswerTemplate = {
  id: string
  slug: string
  title: string
  body: string
  target: "feedback" | "question" | "both"
  is_builtin: boolean
}

export type WbAnswerEndpoint = {
  id: string
  method: string
  host: string
  path: string
  summary: string
  doc_url: string
}

/** A mutation WB documents but our saved copies do not spell the body of. */
export type WbUnregisteredMutation = {
  what: string
  method: string
  path: string
  doc_url: string
  reason: string
}

export type WbFeedbackAnswersResponse = {
  marketplace: string
  op_class: string
  limits: { min_chars: number; max_chars: number; row_limit: number }
  gates: {
    credential: { usable: boolean; reason: string | null }
    live: { env_var: string; enabled: boolean }
    enabled: boolean
    consent: {
      confirmed_by: string
      confirmed_at: string | null
      note: string | null
    } | null
  }
  endpoints: WbAnswerEndpoint[]
  unregistered: WbUnregisteredMutation[]
  templates: WbAnswerTemplate[]
  feedbacks: WbAnswerBucket
  questions: WbAnswerBucket
  audit: Array<{
    id: string
    endpoint_id: string
    method: string
    path: string
    payload_sha256: string
    dry_run: boolean
    outcome: string
    gate: string | null
    actor: string
    status: number | null
    error: string | null
    created_at: string | null
  }>
}

export type WbAnswerDraftPayload = {
  target: WbAnswerTarget
  id: string
  draft_answer: string
}

export type WbAnswerSendPayload = {
  target: WbAnswerTarget
  id: string
  intent: "answer" | "view"
  /** Required for `intent: "answer"`. The hash of the text the dialog quoted. */
  answer_sha256?: string
}

export type WbAnswerSendResult = {
  ok: boolean
  outcome: "dry_run" | "sent" | "refused_locally" | "refused_by_gate"
  message: string
  endpoint_id: string | null
  gate: string | null
  text_sha256: string | null
  payload_sha256: string | null
}

export type WbAnswerSendResponse = {
  result: WbAnswerSendResult
  state: WbFeedbackAnswersResponse
}

/** What the filter asks the backend for. `all` sends no parameter at all. */
export type WbAnswerFilter = "all" | "unanswered" | "answered"

const WB_FEEDBACK_ANSWERS_QUERY_KEY = "tenant-wb-feedback-answers" as const
export const wbFeedbackAnswersQueryKeys = queryKeysFactory(
  WB_FEEDBACK_ANSWERS_QUERY_KEY
)

const pathFor = (filter: WbAnswerFilter) =>
  filter === "all"
    ? "/tenants/wb/feedback-answers"
    : `/tenants/wb/feedback-answers?answered=${filter}`

export const useWbFeedbackAnswers = (
  filter: WbAnswerFilter = "all",
  options?: Omit<
    UseQueryOptions<
      WbFeedbackAnswersResponse,
      FetchError,
      WbFeedbackAnswersResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<WbFeedbackAnswersResponse>(pathFor(filter)),
    queryKey: wbFeedbackAnswersQueryKeys.detail(filter),
    ...options,
  })

  // Named `answers`, not `data` or `status`: react-query's own result carries
  // `status`, and a generic name spread after `...rest` is how that collision
  // happens (the trap wb-status.tsx recorded).
  return { answers: data, ...rest }
}

export const useSaveWbAnswerDraft = (
  filter: WbAnswerFilter = "all",
  options?: UseMutationOptions<
    WbFeedbackAnswersResponse,
    FetchError,
    WbAnswerDraftPayload
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<WbFeedbackAnswersResponse>(
        "/tenants/wb/feedback-answers",
        { method: "PUT", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(wbFeedbackAnswersQueryKeys.detail(filter), data)
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useSendWbAnswer = (
  filter: WbAnswerFilter = "all",
  options?: UseMutationOptions<
    WbAnswerSendResponse,
    FetchError,
    WbAnswerSendPayload
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<WbAnswerSendResponse>(
        "/tenants/wb/feedback-answers/send",
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(
        wbFeedbackAnswersQueryKeys.detail(filter),
        data.state
      )
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
