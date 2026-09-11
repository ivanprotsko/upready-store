import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { emptyPage, listTenantOrderIds } from "../tenant-scope";

/**
 * `GET /tenants/reservations` — the reservations held against line items of the
 * tenant's own orders, in the Admin's list shape. The order-detail fulfillment
 * section reads them to show what stock is already set aside.
 *
 * A reservation carries `line_item_id`, so the scope is two hops: own order ids
 * through the tenant-order link, then those orders' item ids. A tenant with no
 * orders, or with orders that have no items, gets the empty page rather than an
 * undefined filter, which would be no filter at all.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedOrderIds = await listTenantOrderIds(req);

  if (ownedOrderIds.length === 0) {
    res.json({ reservations: [], ...emptyPage(req) });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.id"],
    filters: { id: ownedOrderIds },
  });

  const ownedItemIds = (orders as { items?: ({ id?: string } | null)[] | null }[])
    .flatMap((order) => order.items ?? [])
    .map((item) => item?.id)
    .filter((id): id is string => Boolean(id));

  if (ownedItemIds.length === 0) {
    res.json({ reservations: [], ...emptyPage(req) });
    return;
  }

  const requested = req.filterableFields?.line_item_id;
  const wanted = requested === undefined ? undefined : new Set([requested].flat() as string[]);
  const lineItemIds = wanted ? ownedItemIds.filter((id) => wanted.has(id)) : ownedItemIds;

  if (lineItemIds.length === 0) {
    res.json({ reservations: [], ...emptyPage(req) });
    return;
  }

  const { data: reservations, metadata } = await refetchEntities({
    entity: "reservation",
    idOrFilter: {
      ...req.filterableFields,
      line_item_id: lineItemIds,
    },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    reservations,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
