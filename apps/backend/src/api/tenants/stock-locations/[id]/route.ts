import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { listTenantStockLocationIds } from "../../tenant-scope";

/**
 * `GET /tenants/stock-locations/:id` — one of the shop's own warehouses. The
 * order-detail fulfillment section resolves a fulfillment's location name
 * through it.
 *
 * Scoped for the same reason as the list next to it: a foreign id is a missing
 * id, so another shop's warehouse answers 404 rather than handing its name and
 * street address to a tenant that guessed an id.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const owned = await listTenantStockLocationIds(req);

  if (!owned.includes(req.params.id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Stock location with id: ${req.params.id} was not found`,
    );
  }

  const stock_location = await refetchEntity({
    entity: "stock_location",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.json({ stock_location });
};
