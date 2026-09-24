import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { remapKeysForProduct } from "@medusajs/medusa/api/admin/products/helpers";
import createTenantProductWorkflow from "../../../workflows/tenant/create-tenant-product";
import {
  emptyPage,
  listGroupSites,
  listReadableProductIds,
  listTenantProductIds,
  scopeIdFilter,
} from "../tenant-scope";
import { remapTenantProduct } from "./helpers";
import { withSiteFields } from "./site-scope";

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
 *
 * t-2026-09-24-n12: a tenant in a group lists the products of every site of
 * its client (`listReadableProductIds`), each with `site_scope` and `owned`
 * (`site-scope.ts`). A tenant without a group lists what it did before.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const readableIds = await listReadableProductIds(req);
  const ids = scopeIdFilter(readableIds, req.filterableFields.id);

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

  const group = await listGroupSites(req);
  const ownedIds = group.group_id ? await listTenantProductIds(req) : [];

  res.json({
    products: await withSiteFields(req, products.map(remapTenantProduct), group, ownedIds),
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
