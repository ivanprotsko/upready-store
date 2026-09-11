import { FetchError } from "@medusajs/js-sdk"

// tenant-panel: piece 2. The copied order-detail screen imports mutation hooks
// for actions the panel does not implement: RMA (return, claim, exchange),
// order edits, order transfer and marking a payment collection as paid. Those
// sections never render on a tenant's order today, because the tenant backend
// answers an empty page for returns, claims, exchanges and order changes, so
// the mutations have no button to sit behind. They still have to exist for the
// screen to compile.
//
// Each is wired to this rejection rather than to a `/tenants/*` route that does
// not exist: a 404 from a missing route reads as a bug in the backend, while
// this says what is actually true. Every menu entry that COULD reach one of
// these is routed to `routes/not-built` instead (see app.tsx).

export const notBuiltMutation =
  (action: string) =>
  async (): Promise<never> => {
    throw new FetchError(
      `The tenant panel does not implement "${action}". See routes/not-built.`,
      "Not Implemented",
      501
    )
  }
