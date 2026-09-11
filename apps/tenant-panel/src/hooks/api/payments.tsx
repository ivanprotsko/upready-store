import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { UseMutationOptions, useMutation } from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { ordersQueryKeys } from "./orders"

// tenant-panel: piece 2. Tenant equivalent of the Admin's
// hooks/api/payments.tsx, trimmed to the one action the contract keeps:
// capture. `POST /tenants/payments/:id/capture` checks that the payment's
// collection hangs off one of the tenant's own orders before it runs the
// workflow; a foreign payment id is a 404.
//
// Refund is NOT here: the refund entry in the payment section routes to
// `routes/not-built` (see app.tsx), so there is no hook to call.

const PAYMENT_QUERY_KEY = "payment" as const
export const paymentQueryKeys = queryKeysFactory(PAYMENT_QUERY_KEY)

export const useCapturePayment = (
  orderId: string,
  paymentId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminPaymentResponse,
    FetchError,
    HttpTypes.AdminCapturePayment
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminCapturePayment) =>
      sdk.client.fetch<HttpTypes.AdminPaymentResponse>(
        `/tenants/payments/${paymentId}/capture`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.details(),
      })

      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.preview(orderId),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

