import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { listTenantOrderIds } from "../../tenant-scope";

/**
 * `GET /tenants/customers/:id` — the customer behind one of the tenant's own
 * orders, in the Admin's retrieve shape. The order-detail customer section
 * links to it.
 *
 * A customer is a store-wide row, so ownership is indirect: the id is allowed
 * only while one of the tenant's own orders names it. A customer who has never
 * bought from this tenant is a 404, the same answer as an id that does not
 * exist. `GET /tenants/customers` (t13-customers-screen, `../route.ts`) lists
 * the tenant's own customers through the same ownership rule.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const ownedOrderIds = await listTenantOrderIds(req);

  const notFound = new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Customer with id "${id}" was not found`,
  );

  if (ownedOrderIds.length === 0) {
    throw notFound;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { id: ownedOrderIds, customer_id: id },
  });

  if (orders.length === 0) {
    throw notFound;
  }

  const customer = await refetchEntity({
    entity: "customer",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  if (!customer) {
    throw notFound;
  }

  res.status(200).json({ customer });
};
