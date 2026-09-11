import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { batchProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { refetchBatchVariants } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../tenant-scope";
import { assertProductVariant, remapTenantVariant } from "../../../helpers";

/**
 * `POST /tenants/products/:id/variants/batch` — the create/update/delete batch
 * the copied price grid saves through. Mirrors
 * `@medusajs/medusa/dist/api/admin/products/[id]/variants/batch/route.js`:
 * `product_id` is forced onto every created and updated row from the URL, and
 * the response is the Admin's `{ created, updated, deleted }`.
 *
 * Every id the body names has to be a variant of the product in the URL. The
 * workflow's `update` selector carries `product_id`, but `delete` is a bare id
 * list, so both are checked here before anything runs; a foreign id is a 404
 * and the whole batch is refused rather than partly applied.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminBatchProductVariantRequest>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  const body = req.validatedBody;
  const namedIds = [
    ...(body.update ?? []).map((row) => row.id),
    ...(body.delete ?? []),
  ].filter((id): id is string => Boolean(id));

  for (const id of new Set(namedIds)) {
    await assertProductVariant(req, productId, id);
  }

  const { result } = await batchProductVariantsWorkflow(req.scope).run({
    input: {
      create: body.create?.map((row) => ({ ...row, product_id: productId })),
      update: body.update?.map((row) => ({ ...row, product_id: productId })),
      delete: body.delete,
    },
  });

  const batchResults = await refetchBatchVariants(result, req.scope, req.queryConfig.fields);

  res.status(200).json({
    created: batchResults.created.map(remapTenantVariant),
    updated: batchResults.updated.map(remapTenantVariant),
    deleted: batchResults.deleted,
  });
};
