import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedPayment } from "../../../orders/helpers";

/**
 * `POST /tenants/payments/:id/capture` — captures a payment that belongs to
 * one of the tenant's own orders. Mirrors
 * `@medusajs/medusa/dist/api/admin/payments/[id]/capture/route.js`; the Admin's
 * `refetchPayment` helper is `refetchEntity({ entity: "payment" })`, so that is
 * what is written here rather than importing a path the Admin keeps private.
 *
 * Ownership is the payment's collection belonging to an owned order
 * (`assertOwnedPayment`), checked before the workflow. A payment of another
 * tenant's order is a 404, the same answer as an id that does not exist.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedPayment(req, id);

  await capturePaymentWorkflow(req.scope).run({
    input: {
      payment_id: id,
      captured_by: req.auth_context.actor_id,
      amount: (req.validatedBody as { amount?: number } | undefined)?.amount,
    },
  });

  const payment = await refetchEntity({
    entity: "payment",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ payment });
};
