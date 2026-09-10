import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { getTenantScope } from "../tenant-scope";

/**
 * `GET /tenants/store` — the store the panel renders around: the backend's own
 * store row (currencies, default region, default location, metadata) with two
 * fields answered from the tenant instead of the store, because those two are
 * what a tenant owns. `name` is the tenant's name, which is what the panel's
 * sidebar shows, and `default_sales_channel_id` is the tenant's channel, so a
 * screen that defaults to "the store's channel" defaults to the tenant's.
 *
 * There is one store row on a Medusa backend, so this is a retrieve, not a
 * list. The currencies and the region are genuinely shared: the price grid
 * reads `supported_currencies`, and every storefront already shows them.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);

  const {
    data: [store],
  } = await refetchEntities({
    entity: "store",
    idOrFilter: {},
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  if (!store) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No store is configured on this backend.",
    );
  }

  res.json({
    store: {
      ...store,
      name: tenant.name,
      default_sales_channel_id: tenant.sales_channel_id,
    },
  });
};
