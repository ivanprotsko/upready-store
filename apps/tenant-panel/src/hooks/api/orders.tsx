import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { CdekPrintKind, cdekPrintPath } from "../../lib/cdek-print"
import { CsvExport, readCsvExport } from "../../lib/csv-download"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory, TQueryKey } from "../../lib/query-key-factory"
import { notBuiltMutation } from "./not-built"
import { reservationItemsQueryKeys } from "./reservations"

// tenant-panel: tenant equivalent of the Admin's hooks/api/orders.tsx. Every
// call goes to `/tenants/*` instead of `/admin/*`; the request and response
// shapes are the Admin's, because the screens above are the Admin's own files
// (docs/tenant-panel/api-contract.md).
//
// What is here: list, retrieve, preview, changes, line items, and the five
// actions the contract keeps for the panel (fulfil, ship, cancel a
// fulfillment, mark delivered, cancel the order) plus the CSV export.
//
// What is NOT here: order update (email, addresses), credit lines, transfer,
// draft orders and the RMA flows. Those entries in the action menu route to
// `routes/not-built`; `useCancelOrderTransfer` below is the one exception, a
// stub the copied timeline imports unconditionally.
//
// tenant-panel: the Admin's `useCreateOrderFulfillment` and
// `useCancelOrderFulfillment` also invalidate `inventoryItemsQueryKeys`. The
// panel has no inventory hook module, so those two lines are dropped and the
// reservation list is still invalidated, which is what the fulfillment form
// reads.

const ORDERS_QUERY_KEY = "orders" as const
const _orderKeys = queryKeysFactory(ORDERS_QUERY_KEY) as TQueryKey<"orders"> & {
  preview: (orderId: string) => any
  changes: (orderId: string) => any
  lineItems: (orderId: string, query?: any) => any
  shippingOptions: (orderId: string) => any
}

_orderKeys.preview = function (id: string) {
  return [this.detail(id), "preview"]
}

_orderKeys.changes = function (id: string) {
  return [this.detail(id), "changes"]
}

_orderKeys.lineItems = function (id: string, query?: any) {
  return [this.detail(id), query ? { query } : undefined, "lineItems"].filter(
    (k) => !!k
  )
}

_orderKeys.shippingOptions = function (id: string) {
  return [this.detail(id), "shippingOptions"]
}

export const ordersQueryKeys = _orderKeys

export const useOrders = (
  query?: HttpTypes.AdminOrderFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminOrderListResponse,
      FetchError,
      HttpTypes.AdminOrderListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminOrderListResponse>("/tenants/orders", {
        query,
      }),
    queryKey: ordersQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useOrder = (
  id: string,
  query?: Record<string, any>,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminOrderResponse,
      FetchError,
      HttpTypes.AdminOrderResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminOrderResponse>(`/tenants/orders/${id}`, {
        query,
      }),
    queryKey: ordersQueryKeys.detail(id, query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useOrderPreview = (
  id: string,
  query?: HttpTypes.AdminOrderFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminOrderPreviewResponse,
      FetchError,
      HttpTypes.AdminOrderPreviewResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminOrderPreviewResponse>(
        `/tenants/orders/${id}/preview`,
        { query }
      ),
    queryKey: ordersQueryKeys.preview(id),
    ...options,
  })

  return { ...data, ...rest }
}

export const useOrderChanges = (
  id: string,
  query?: HttpTypes.AdminOrderChangesFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminOrderChangesResponse,
      FetchError,
      HttpTypes.AdminOrderChangesResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminOrderChangesResponse>(
        `/tenants/orders/${id}/changes`,
        { query }
      ),
    queryKey: ordersQueryKeys.changes(id),
    ...options,
  })

  return { ...data, ...rest }
}

export const useOrderLineItems = (
  id: string,
  query?: HttpTypes.AdminOrderItemsFilters,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminOrderLineItemsListResponse,
      FetchError,
      HttpTypes.AdminOrderLineItemsListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: async () =>
      sdk.client.fetch<HttpTypes.AdminOrderLineItemsListResponse>(
        `/tenants/orders/${id}/line-items`,
        { query }
      ),
    queryKey: ordersQueryKeys.lineItems(id, query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCancelOrder = (
  orderId: string,
  options?: UseMutationOptions<HttpTypes.AdminOrderResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<HttpTypes.AdminOrderResponse>(
        `/tenants/orders/${orderId}/cancel`,
        { method: "POST" }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.detail(orderId),
      })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useCreateOrderFulfillment = (
  orderId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminOrderResponse,
    FetchError,
    HttpTypes.AdminCreateOrderFulfillment
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminCreateOrderFulfillment) =>
      sdk.client.fetch<HttpTypes.AdminOrderResponse>(
        `/tenants/orders/${orderId}/fulfillments`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      queryClient.invalidateQueries({
        queryKey: reservationItemsQueryKeys.lists(),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useCreateOrderShipment = (
  orderId: string,
  fulfillmentId: string,
  options?: UseMutationOptions<
    { order: HttpTypes.AdminOrder },
    FetchError,
    HttpTypes.AdminCreateOrderShipment
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminCreateOrderShipment) =>
      sdk.client.fetch<{ order: HttpTypes.AdminOrder }>(
        `/tenants/orders/${orderId}/fulfillments/${fulfillmentId}/shipments`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useCancelOrderFulfillment = (
  orderId: string,
  fulfillmentId: string,
  options?: UseMutationOptions<any, FetchError, any>
) => {
  return useMutation({
    mutationFn: (payload: { no_notification?: boolean }) =>
      sdk.client.fetch<{ order: HttpTypes.AdminOrder }>(
        `/tenants/orders/${orderId}/fulfillments/${fulfillmentId}/cancel`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      queryClient.invalidateQueries({
        queryKey: reservationItemsQueryKeys.lists(),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useMarkOrderFulfillmentAsDelivered = (
  orderId: string,
  fulfillmentId: string,
  options?: UseMutationOptions<
    { order: HttpTypes.AdminOrder },
    FetchError,
    HttpTypes.AdminMarkOrderFulfillmentAsDelivered
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminMarkOrderFulfillmentAsDelivered) =>
      sdk.client.fetch<{ order: HttpTypes.AdminOrder }>(
        `/tenants/orders/${orderId}/fulfillments/${fulfillmentId}/mark-as-delivered`,
        { method: "POST", body: payload ?? {} }
      ),
    onSuccess: (data: any, variables: any, context: any) => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * tenant-panel: the Admin's export starts a background workflow and answers
 * `202 { transaction_id }`; the file arrives later by notification. The panel
 * has no notification feed, so `POST /tenants/orders/export` builds the CSV
 * synchronously and answers with the CSV itself (`lib/csv-download.ts`). The
 * filters ride in the query string, the way the Admin's own SDK sends them.
 */
export type TenantOrderExportResponse = CsvExport

export const useExportOrders = (
  query?: HttpTypes.AdminOrderFilters,
  options?: UseMutationOptions<
    TenantOrderExportResponse,
    FetchError,
    HttpTypes.AdminOrderFilters
  >
) => {
  return useMutation({
    mutationFn: async () => {
      // `accept: text/csv` makes the SDK hand back the raw `Response`.
      const response = (await sdk.client.fetch("/tenants/orders/export", {
        method: "POST",
        headers: { accept: "text/csv" },
        query,
      })) as unknown as Response

      return readCsvExport(response, "orders-export.csv")
    },
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * t-2026-10-14-58, part A: the CDEK label or receipt of one fulfillment, as
 * the PDF itself (`lib/cdek-print.ts`). `accept: application/pdf` makes the SDK
 * hand back the raw `Response`; a refusal still throws its `FetchError`, with
 * the status the toast is chosen by.
 */
export const useCdekPdf = (
  orderId: string,
  fulfillmentId: string,
  options?: UseMutationOptions<Blob, FetchError, CdekPrintKind>
) => {
  return useMutation({
    mutationFn: async (kind: CdekPrintKind) => {
      const response = (await sdk.client.fetch(
        cdekPrintPath(orderId, fulfillmentId, kind),
        { method: "GET", headers: { accept: "application/pdf" } }
      )) as unknown as Response

      return response.blob()
    },
    ...options,
  })
}

// tenant-panel: order transfer is out of scope. `POST /tenants/orders/:id/transfer`
// does not exist and the "Transfer ownership" entry routes to `routes/not-built`
// (app.tsx). The copied timeline imports this hook unconditionally for the
// transfer entry, which only renders while an order change of type transfer is
// pending; `GET /tenants/orders/:id/changes` never returns one. See
// `not-built.ts`.
export const useCancelOrderTransfer = (
  _orderId: string,
  options?: UseMutationOptions<any, FetchError, void>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel an order transfer"),
    ...options,
  })
}

// tenant-panel: authorizing a payment session by hand is out of scope. The
// Admin posts to `POST /admin/orders/:id/payment-sessions/authorize`, which the
// contract does not carry into `/tenants/*`: the payment section offers it only
// for a pending session of a manual provider, and the panel's one payment
// action is capture. Lives in this module because the Admin keeps it here too.
// See `not-built.ts`.
export const useAuthorizePaymentSession = (
  _orderId: string,
  _sessionId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminAuthorizeOrderPaymentSessionResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: notBuiltMutation("authorize a payment session"),
    ...options,
  })
}
