import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { emptyPage, getTenantScope, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/sales-channels` — the tenant's own sales channel, as a
 * one-row Admin list. The channel comes from the tenant-sales-channel link,
 * so a tenant whose channel was deleted through the Admin gets an empty page
 * with `count: 0` rather than a dead id, and no request parameter can widen
 * the set beyond that one channel.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const owned = tenant.sales_channel_id ? [tenant.sales_channel_id] : [];
  const ids = scopeIdFilter(owned, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ sales_channels: [], ...emptyPage(req) });
    return;
  }

  const { data: sales_channels, metadata } = await refetchEntities({
    entity: "sales_channel",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    sales_channels,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
