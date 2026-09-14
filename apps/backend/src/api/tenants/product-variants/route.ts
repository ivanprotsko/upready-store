import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { remapKeysForVariant } from "@medusajs/medusa/api/admin/products/helpers";
import { wrapVariantsWithTotalInventoryQuantity } from "@medusajs/medusa/api/utils/middlewares/index";
import { emptyPage, listTenantProductIds, scopeIdFilter } from "../tenant-scope";
import { remapTenantVariant } from "../products/helpers";

/**
 * `GET /tenants/product-variants` — every variant of the tenant's own products,
 * in the Admin's list shape. Mirrors
 * `@medusajs/medusa/dist/api/admin/product-variants/route.js`, including the
 * `inventory_quantity` field that is computed rather than selected.
 *
 * Scope is the `product_id` filter built from the tenant-product link, not an
 * `id` filter: the caller's `id` parameter keeps narrowing variants as the
 * Admin's validator intends, while the tenant boundary stays on the product.
 * A tenant with no products gets an empty page, never an unfiltered list.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedProductIds = await listTenantProductIds(req);
  const productIds = scopeIdFilter(ownedProductIds, req.filterableFields.product_id);

  if (productIds.length === 0) {
    res.json({ variants: [], ...emptyPage(req) });
    return;
  }

  const withInventoryQuantity = req.queryConfig.fields.some((field) =>
    field.includes("inventory_quantity"),
  );

  if (withInventoryQuantity) {
    req.queryConfig.fields = req.queryConfig.fields.filter(
      (field) => !field.includes("inventory_quantity"),
    );
  }

  const { data: variants, metadata } = await refetchEntities({
    entity: "variant",
    idOrFilter: { ...req.filterableFields, product_id: productIds },
    scope: req.scope,
    fields: remapKeysForVariant(req.queryConfig.fields ?? []),
    pagination: req.queryConfig.pagination,
  });

  if (withInventoryQuantity) {
    await wrapVariantsWithTotalInventoryQuantity(req, variants || []);
  }

  res.json({
    variants: variants.map(remapTenantVariant),
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
