import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import tenantProductCategoryLink from "../../../../links/tenant-product-category";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/product-categories` — the public read of one tenant's
 * category tree, for its storefront.
 *
 * The tenant comes from the publishable key the framework already validated
 * (`resolveTenantFromPublishableKey`, shared with `/store/tenant/me` and the
 * wave-2 pages/home routes), never from a query parameter. The owned ids come
 * from the tenant-product-category link, read through its own entry point
 * `tenant_product_category` rather than through `tenant_admin`, because there is
 * no tenant admin in a storefront request.
 *
 * The response is `/store/product-categories`'s own shape and its own parameters
 * (`StoreProductCategoriesParams` + `listProductCategoryConfig`, wired in
 * `src/api/middlewares.ts`), so a storefront can swap one URL for the other.
 * `is_active: true` / `is_internal: false` are forced the way the Store route's
 * `applyCategoryFilters` middleware forces them: an unpublished category is not
 * public even to its own storefront.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: links } = await query.graph({
    entity: tenantProductCategoryLink.entryPoint,
    fields: ["product_category_id"],
    filters: { tenant_id: tenant.id },
  });

  const ownedIds = links
    .map((link) => link?.product_category_id as string | undefined)
    .filter((id): id is string => Boolean(id));

  const requested = req.filterableFields.id;
  const wanted =
    requested === undefined || requested === null
      ? ownedIds
      : ownedIds.filter((id) =>
          (Array.isArray(requested) ? requested : [requested]).includes(id),
        );

  if (wanted.length === 0) {
    res.json({
      product_categories: [],
      count: 0,
      offset: req.queryConfig?.pagination?.skip ?? 0,
      limit: req.queryConfig?.pagination?.take ?? 0,
    });
    return;
  }

  const { data: product_categories, metadata } = await query.graph(
    {
      entity: "product_category",
      fields: req.queryConfig.fields,
      filters: { ...req.filterableFields, id: wanted },
      pagination: req.queryConfig.pagination,
    },
    { locale: req.locale },
  );

  res.json({
    product_categories,
    count: metadata?.count,
    offset: metadata?.skip,
    limit: metadata?.take,
  });
};
