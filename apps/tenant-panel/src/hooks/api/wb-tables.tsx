import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hook, no Admin counterpart — GET /tenants/wb/tables per
// w03-wb-sales-questions-mirror. Read-only like its sibling: these are
// mirrors of the WB cabinet, and nothing on the screen can write back.
//
// Separate from useWbStatus because the two answer different questions and
// cost different amounts: the status call is small, this one aggregates the
// sales, questions and funnel tables.

export type WbSaleRow = {
  srid: string
  sale_id: string | null
  nm_id: string | null
  supplier_article: string | null
  subject: string | null
  brand: string | null
  tech_size: string | null
  finished_price: number | null
  for_pay: number | null
  region_name: string | null
  warehouse_name: string | null
  sale_date: string | null
}

export type WbQuestionRow = {
  question_id: string
  nm_id: string | null
  product_name: string | null
  supplier_article: string | null
  text: string | null
  answer_text: string | null
  state: string | null
  is_answered: boolean
  was_viewed: boolean | null
  created_date: string | null
}

export type WbFunnelRow = {
  nm_id: string
  title: string | null
  vendor_code: string | null
  open_card: number | null
  add_to_cart: number | null
  orders: number | null
  ordered_sum: number
  buyouts: number | null
  buyout_sum: number
  days: number
}

export type WbTablesResponse = {
  sales: {
    window_days: number
    lines: number
    /** Sum of `finishedPrice`: what customers paid. */
    customer_paid: number
    /** Sum of `forPay`: what WB pays the shop. */
    for_pay: number
    /** Lines with a negative `forPay`, which is the return half of this feed. */
    return_lines: number
    first_sale: string | null
    last_sale: string | null
    rows: WbSaleRow[]
  }
  questions: {
    unanswered: number
    answered: number
    rows: WbQuestionRow[]
  }
  analytics: {
    period_start: string | null
    period_end: string | null
    listings: number
    day_rows: number
    rows: WbFunnelRow[]
  }
}

const WB_TABLES_QUERY_KEY = "tenant-wb-tables" as const
export const wbTablesQueryKeys = queryKeysFactory(WB_TABLES_QUERY_KEY)

export const useWbTables = (
  options?: Omit<
    UseQueryOptions<WbTablesResponse, FetchError, WbTablesResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<WbTablesResponse>("/tenants/wb/tables"),
    queryKey: wbTablesQueryKeys.details(),
    ...options,
  })

  // Named `tables` rather than spread into `...rest`, for the same reason the
  // status hook returns `wb`: react-query's own result carries `status`,
  // `error` and `data`, and a response field of the same name is overwritten
  // by them (measured on the stand 2026-09-16, w01 defect 3).
  return { tables: data, ...rest }
}
