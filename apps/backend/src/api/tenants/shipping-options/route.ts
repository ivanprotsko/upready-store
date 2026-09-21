import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, remoteQueryObjectFromString } from "@medusajs/framework/utils";
import { emptyPage, listTenantStockLocationIds, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/shipping-options` — the delivery options of the shop's own
 * warehouses, and nothing else.
 *
 * This used to re-export the Admin's list handler as "read-only reference
 * data", with the comment that options belong to the store and not to a tenant.
 * That stopped being true when `provisionTenantWarehouseWorkflow` gave every
 * shop its own warehouse with its own options: on the two-shop stand the owner
 * of one shop listed 486 options, two for every warehouse of the deployment,
 * and read another shop's options with their prices by sending its
 * `stock_location_id` (architecture review 2026-09-21, finding T-5).
 *
 * The set is the fulfillment sets of the warehouses `listTenantStockLocationIds`
 * returns, the same ownership `GET /tenants/stock-locations` uses. The
 * `stock_location_id` filter of the create-fulfillment form still works and can
 * only NARROW the set (`scopeIdFilter`).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const locationIds = await listTenantStockLocationIds(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: locations } = locationIds.length
    ? await query.graph({
        entity: "stock_location",
        fields: ["id", "fulfillment_sets.id"],
        filters: { id: locationIds },
      })
    : { data: [] };

  const owned = locations.flatMap((location: { fulfillment_sets?: Array<{ id: string } | null> }) =>
    (location.fulfillment_sets ?? []).flatMap((set) => (set?.id ? [set.id] : [])),
  );
  // `maybeApplyLinkFilter` leaves the sets of a `stock_location_id` the caller
  // sent under `service_zone.fulfillment_set_id`, already nested.
  const serviceZone = (req.filterableFields.service_zone ?? {}) as Record<string, unknown>;
  const fulfillmentSetIds = scopeIdFilter(owned, serviceZone.fulfillment_set_id);

  if (fulfillmentSetIds.length === 0) {
    res.json({ shipping_options: [], ...emptyPage(req) });
    return;
  }

  const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
  const { rows: shipping_options, metadata } = await remoteQuery(
    remoteQueryObjectFromString({
      entryPoint: "shipping_options",
      variables: {
        filters: {
          ...req.filterableFields,
          service_zone: { ...serviceZone, fulfillment_set_id: fulfillmentSetIds },
        },
        ...req.queryConfig.pagination,
      },
      fields: req.queryConfig.fields,
    }),
  );

  res.json({
    shipping_options,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
