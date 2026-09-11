import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { assertOwnedProduct } from "../../../tenant-scope";

/**
 * `GET /tenants/products/:id/options` — the options of one of the tenant's own
 * products, in the Admin's list shape. Mirrors
 * `@medusajs/medusa/dist/api/admin/products/[id]/options/route.js`.
 *
 * In 2.19.0 `product_option` is many-to-many with products, so the filter is
 * the nested `products: { id: productId }` rather than a `product_id` column,
 * the same shape `GET /tenants/product-options` already uses.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  const { data: product_options, metadata } = await refetchEntities({
    entity: "product_option",
    idOrFilter: { ...req.filterableFields, products: { id: productId } },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    product_options,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
