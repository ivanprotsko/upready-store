import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { createAndLinkProductOptionsToProductWorkflow } from "@medusajs/medusa/core-flows";
import { remapKeysForProduct } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../tenant-scope";
import { remapTenantProduct } from "../../../helpers";

/**
 * `POST /tenants/products/:id/options/batch` — the one write the copied
 * "manage options" drawer makes (`sdk.admin.product.linkOptions`, which posts
 * here). 2.19.0 has no `options/:option_id` routes at all: an option is
 * created, linked, relinked and unlinked through this single batch, so the
 * contract's `POST/DELETE …/options/:option_id` have no Admin counterpart to
 * mirror and are not implemented. See the report's contract gaps.
 *
 * `product_id` comes from the URL after the ownership check, so options can
 * only ever be attached to a product the tenant owns.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminLinkProductOptions>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  await createAndLinkProductOptionsToProductWorkflow(req.scope).run({
    input: {
      product_id: productId,
      ...req.validatedBody,
    },
  });

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: productId,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  });

  res.status(200).json({ product: remapTenantProduct(product) });
};
