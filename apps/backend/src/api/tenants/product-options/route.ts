import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { emptyPage, listTenantProductIds, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/product-options` — the options of the tenant's own products.
 *
 * In 2.19.0 a product option is many-to-many with products (`is_exclusive`
 * decides whether it is private to one product), so the scope is the nested
 * filter `products.id`, not a `product_id` column. `product_id` stays the
 * query parameter, because that is the name the Admin's forms use; it narrows
 * within the tenant's own products and can never widen past them.
 *
 * The Admin's default fields include `products.*`. A shared option is attached
 * to whichever products declare the same title, another tenant's included, so
 * the relation is dropped from the selection here rather than answered with
 * foreign rows.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedProductIds = await listTenantProductIds(req);
  const productIds = scopeIdFilter(ownedProductIds, req.filterableFields.product_id);

  if (productIds.length === 0) {
    res.json({ product_options: [], ...emptyPage(req) });
    return;
  }

  const { product_id: _requested, ...filters } = req.filterableFields;

  const fields = (req.queryConfig.fields ?? []).filter(
    (field) => !field.replace(/^\*/, "").startsWith("products"),
  );

  const { data: product_options, metadata } = await refetchEntities({
    entity: "product_option",
    idOrFilter: { ...filters, products: { id: productIds } },
    scope: req.scope,
    fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    product_options,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
