import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { UseMutationOptions, useMutation } from "@tanstack/react-query"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { notBuiltMutation } from "./not-built"

// tenant-panel: piece 2. The Admin's `useMarkPaymentCollectionAsPaid` posts to
// `POST /admin/payment-collections/:id/mark-as-paid`, which settles a payment
// collection without a provider capture. The contract's action list for the
// panel is fulfil, ship, mark delivered, capture and cancel; marking a
// collection paid is not on it and there is no `/tenants/payment-collections`
// route, so the hook rejects with the "not built" error rather than calling a
// route that does not exist. See `not-built.ts`.

const PAYMENT_COLLECTION_QUERY_KEY = "payment-collection" as const
export const paymentCollectionQueryKeys = queryKeysFactory(
  PAYMENT_COLLECTION_QUERY_KEY
)

export const useMarkPaymentCollectionAsPaid = (
  _orderId: string,
  _paymentCollectionId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPaymentCollectionResponse,
    FetchError,
    HttpTypes.AdminMarkPaymentCollectionAsPaid
  >
) => {
  return useMutation({
    mutationFn: notBuiltMutation("mark a payment collection as paid"),
    ...options,
  })
}
