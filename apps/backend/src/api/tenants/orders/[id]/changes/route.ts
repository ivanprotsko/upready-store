import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { assertOwnedOrder } from "../../helpers";

/**
 * `GET /tenants/orders/:id/changes` — the order's change history, read by the
 * activity timeline. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/changes/route.js`, with
 * `query.graph` in place of the deprecated `remoteQuery` the Admin still uses
 * there; same entry point (`order_change`), same filters, same fields.
 *
 * An order with no changes answers `{ order_changes: [] }`, which is what the
 * panel's timeline renders today.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedOrder(req, id);

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: order_changes } = await query.graph({
    entity: "order_change",
    filters: {
      ...req.filterableFields,
      order_id: id,
    },
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ order_changes });
};
