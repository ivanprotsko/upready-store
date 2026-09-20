import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { emptyPage, listTenantStockLocationIds, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/stock-locations` — the warehouses the shop fulfils from, and
 * nothing else.
 *
 * This used to re-export the Admin's list handler as "read-only reference
 * data", on the premise that the database holds one warehouse per tenant plus
 * a shared default. On the real multi-tenant database that premise is false:
 * the seed creates a warehouse per region, so the create-fulfillment form's
 * "Location" combobox offered 253 warehouses (measured 2026-09-15 on a clone
 * of the client's database), every other shop's name and street address among
 * them, with the shop's own warehouse nowhere near the first page. The owner
 * could not pick a location, the "Create fulfillment" button stayed disabled,
 * and the whole pack → ship → tracking path was unreachable from the panel.
 *
 * The set is the sales-channel <-> stock-location link
 * `provisionTenantWarehouseWorkflow` writes for every new shop, the same link
 * the Admin's `sales_channel_id` filter walks. A query parameter can only
 * NARROW it (`scopeIdFilter`), the way every other list in this namespace
 * behaves.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const owned = await listTenantStockLocationIds(req);
  const ids = scopeIdFilter(owned, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ stock_locations: [], ...emptyPage(req) });
    return;
  }

  const { data: stock_locations, metadata } = await refetchEntities({
    entity: "stock_location",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    stock_locations,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
