import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { batchVariantImagesWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedProduct } from "../../../../../../tenant-scope";
import { assertProductVariant } from "../../../../../helpers";

/**
 * `POST /tenants/products/:id/variants/:variant_id/images/batch` — attaches and
 * detaches product images on one variant (the copied variant-media screen).
 * Mirrors the Admin route; the ids in `add`/`remove` are image ids of the same
 * product, which the workflow resolves itself.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ add?: string[]; remove?: string[] }>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);

  const { result } = await batchVariantImagesWorkflow(req.scope).run({
    input: {
      variant_id: variantId,
      add: req.validatedBody.add,
      remove: req.validatedBody.remove,
    },
  });

  res.status(200).json({
    added: result.added,
    removed: result.removed,
  });
};
