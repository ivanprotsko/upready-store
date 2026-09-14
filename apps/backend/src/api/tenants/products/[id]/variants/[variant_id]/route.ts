import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import {
  deleteProductVariantsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  remapKeysForProduct,
  remapKeysForVariant,
} from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../tenant-scope";
import { assertProductVariant, remapTenantProduct, remapTenantVariant } from "../../../helpers";

/** `GET /tenants/products/:id/variants/:variant_id` → `{ variant }`. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);

  const variant = await refetchEntity({
    entity: "variant",
    idOrFilter: { id: variantId, product_id: productId },
    scope: req.scope,
    fields: remapKeysForVariant(req.queryConfig.fields ?? []),
  });

  res.status(200).json({ variant: remapTenantVariant(variant) });
};

/**
 * `POST /tenants/products/:id/variants/:variant_id` — updates one variant of
 * one of the tenant's own products. The selector carries `product_id` as well
 * as the variant id, the way the Admin route does, so the update can never
 * reach a variant outside the product in the URL.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdateProductVariant>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);

  const { additional_data, ...update } = req.validatedBody as
    & HttpTypes.AdminUpdateProductVariant
    & { additional_data?: Record<string, unknown> };

  await updateProductVariantsWorkflow(req.scope).run({
    input: {
      selector: { id: variantId, product_id: productId },
      update,
      additional_data,
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

/**
 * `DELETE /tenants/products/:id/variants/:variant_id` — deletes one variant.
 *
 * `deleteProductVariantsWorkflow` takes ids alone and cannot be told which
 * product they must belong to (the Admin's own route carries a comment saying
 * so). For the Admin that is harmless; here it is the isolation boundary, so
 * `assertProductVariant` proves the parent before the workflow runs and a
 * variant of another product answers 404 having deleted nothing.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);

  await deleteProductVariantsWorkflow(req.scope).run({
    input: { ids: [variantId] },
  });

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: productId,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  });

  res.status(200).json({
    id: variantId,
    object: "variant",
    deleted: true,
    parent: remapTenantProduct(product),
  });
};
