import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { batchImageVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedProduct } from "../../../../../../tenant-scope";
import { assertProductImage, assertOwnedVariants } from "../../../../../helpers";

/**
 * `POST /tenants/products/:id/images/:image_id/variants/batch` — attaches and
 * detaches variants on one product image (the copied
 * product-image-variants-edit drawer). Mirrors the Admin route.
 *
 * The workflow addresses the image by id alone, so the image is proven to
 * belong to the product in the URL first, and every variant id in the body is
 * proven to belong to the tenant: otherwise an owned image could be linked to
 * another tenant's variant.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ add?: string[]; remove?: string[] }>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;
  const imageId = req.params.image_id;

  await assertOwnedProduct(req, productId);
  await assertProductImage(req, productId, imageId);
  await assertOwnedVariants(req, [
    ...(req.validatedBody.add ?? []),
    ...(req.validatedBody.remove ?? []),
  ]);

  const { result } = await batchImageVariantsWorkflow(req.scope).run({
    input: {
      image_id: imageId,
      add: req.validatedBody.add,
      remove: req.validatedBody.remove,
    },
  });

  res.status(200).json({
    added: result.added,
    removed: result.removed,
  });
};
