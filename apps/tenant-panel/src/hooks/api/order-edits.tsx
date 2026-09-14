import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { UseMutationOptions, useMutation } from "@tanstack/react-query"
import { notBuiltMutation } from "./not-built"

// tenant-panel: piece 2. Order editing is out of scope: the "Edit order" entry
// in the action menu routes to `routes/not-built` (app.tsx), and
// `GET /tenants/orders/:id/changes` answers an empty list, so the active-edit
// section never renders. These two mutations exist only so that section
// compiles.

export const useCancelOrderEdit = (
  _orderId: string,
  options?: UseMutationOptions<any, FetchError, void>
) => {
  return useMutation({
    mutationFn: notBuiltMutation("cancel an order edit"),
    ...options,
  })
}

export const useConfirmOrderEdit = (
  _id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminOrderEditPreviewResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: notBuiltMutation("confirm an order edit"),
    ...options,
  })
}
