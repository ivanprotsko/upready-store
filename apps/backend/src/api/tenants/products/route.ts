import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { remapKeysForProduct } from "@medusajs/medusa/api/admin/products/helpers";
import createTenantProductWorkflow from "../../../workflows/tenant/create-tenant-product";
import { emptyPage, listTenantProductIds, scopeIdFilter } from "../tenant-scope";
import { remapTenantProduct } from "./helpers";

/**
 * `POST /tenants/products` — creates a product in the tenant's own sales
 * channel and records the tenant as its owner. Body: the Admin's
 * `AdminCreateProduct` shape; `sales_channels` in it are ignored in favour of
 * the tenant's channel.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateProduct>,
  res: MedusaResponse,
) => {
  const { result } = await createTenantProductWorkflow(req.scope).run({
    input: {
      tenant_admin_id: req.auth_context.actor_id,
      product: req.validatedBody,
    },
  });

  res.status(201).json({
    product: result.product,
  });
};

/**
 * `GET /tenants/products` — the products linked to the tenant, nothing else,
 * in the Admin's list shape (`products`, `count`, `offset`, `limit`) so the
 * panel can render the Admin's own product list unchanged.
 *
 * The query is parsed by the Admin's `AdminGetProductsParams` and
 * `listProductQueryConfig` (wired in `src/api/middlewares.ts`), so `q`,
 * `status`, `order`, `fields` and the rest behave exactly as on
 * `GET /admin/products`. Isolation is the `id` constraint: the tenant's own
 * product ids come from the tenant-product link and are intersected with any
 * `id` the caller asked for. An empty intersection returns an empty page
 * instead of an undefined `id` filter, which would be no filter at all and
 * would list every product on the backend.
 *
 * `remapKeysForProduct` and `remapTenantProduct` are the Admin's own
 * helpers: prices live under `variant.price_set.prices` in the graph and the
 * Admin's screens read them as `variant.prices`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantProductIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ products: [], ...emptyPage(req) });
    return;
  }

  const { data: products, metadata } = await refetchEntities({
    entity: "product",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
    pagination: req.queryConfig.pagination,
    withDeleted: req.queryConfig.withDeleted,
  });

  res.json({
    products: products.map(remapTenantProduct),
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
