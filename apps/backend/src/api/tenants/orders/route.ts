import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows";

/**
 * `GET /tenants/orders` — the orders linked to the tenant by
 * `linkOrderToTenantWorkflow`, loaded through the same `getOrdersListWorkflow`
 * the Admin uses so totals and items come back computed.
 *
 * The recipe passes `vendor.orders.map(o => o.id)` straight into the filter.
 * With no linked orders that is `undefined`, and an undefined `id` filter is
 * no filter at all: the workflow would return EVERY order on the backend to a
 * tenant that has none. The early return below is the isolation guarantee.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["tenant.id", "tenant.orders.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  const orderIds = (tenantAdmin?.tenant?.orders ?? [])
    .map((order) => order?.id)
    .filter((id): id is string => Boolean(id));

  if (orderIds.length === 0) {
    res.json({ orders: [] });
    return;
  }

  const { result: orders } = await getOrdersListWorkflow(req.scope).run({
    input: {
      fields: [
        "id",
        "display_id",
        "status",
        "email",
        "currency_code",
        "sales_channel_id",
        "created_at",
        "metadata",
        "total",
        "subtotal",
        "shipping_total",
        "tax_total",
        "items.*",
        "items.variant",
        "items.variant.product",
        "shipping_methods",
        "payment_collections",
        "fulfillments",
      ],
      variables: {
        filters: {
          id: orderIds,
        },
      },
    },
  });

  res.json({
    orders,
  });
};
