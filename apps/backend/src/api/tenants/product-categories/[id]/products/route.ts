import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { batchLinkProductsToCategoryWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedCategory, listTenantProductIds } from "../../../tenant-scope";

type CategoryProductsBody = {
  add?: string[];
  remove?: string[];
};

/**
 * `POST /tenants/product-categories/:id/products` — the Admin's
 * add/remove-products batch for one category, behind two ownership checks.
 *
 * The category in the URL has to be the tenant's own (404 otherwise), and every
 * product id in `add` and in `remove` has to be a product the tenant owns
 * through the tenant-product link. A foreign product id is `INVALID_DATA` (400)
 * and the message names nothing, because naming the id back would confirm that
 * another tenant's product exists. `remove` is checked too: a tenant must not be
 * able to unlink another tenant's product from a shared category.
 *
 * Body: `createLinkBody()` (`{ add?: string[], remove?: string[] }`), which is
 * what the Admin's own route validates with. The contract named it
 * `AdminBatchProductCategoryProducts`; no such export exists in 2.19.0 (see the
 * report's contract gaps).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<CategoryProductsBody>,
  res: MedusaResponse,
) => {
  const { id } = req.params;

  await assertOwnedCategory(req, id);

  const touched = [...(req.validatedBody.add ?? []), ...(req.validatedBody.remove ?? [])];

  if (touched.length > 0) {
    const ownedProductIds = new Set(await listTenantProductIds(req));

    if (touched.some((productId) => !ownedProductIds.has(productId))) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "One or more products do not belong to this tenant.",
      );
    }
  }

  await batchLinkProductsToCategoryWorkflow(req.scope).run({
    input: { id, ...req.validatedBody },
  });

  const category = await refetchEntity({
    entity: "product_category",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ product_category: category });
};
