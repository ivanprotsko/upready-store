import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities, refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { createProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import {
  remapKeysForProduct,
  remapKeysForVariant,
} from "@medusajs/medusa/api/admin/products/helpers";
import { wrapVariantsWithTotalInventoryQuantity } from "@medusajs/medusa/api/utils/middlewares/index";
import { assertOwnedProduct, assertReadableProduct } from "../../../tenant-scope";
import { remapTenantProduct, remapTenantVariant } from "../../helpers";

/**
 * `GET /tenants/products/:id/variants` — the variants of one of the tenant's
 * own products, in the Admin's list shape. Mirrors
 * `@medusajs/medusa/dist/api/admin/products/[id]/variants/route.js` GET,
 * including the `inventory_quantity` dance: that field is not a column, so the
 * Admin strips it from the selected fields and fills it in afterwards from the
 * inventory module. The product-stock loader asks for it, so the behaviour has
 * to come across.
 *
 * Isolation is the owned product in the URL plus the `product_id` filter: a
 * variant of another tenant's product cannot be reached through this path.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;

  await assertReadableProduct(req, productId);

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
    idOrFilter: { ...req.filterableFields, product_id: productId },
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

/**
 * `POST /tenants/products/:id/variants` — creates a variant on one of the
 * tenant's own products. The response is the whole product in the Admin's
 * retrieve shape, which is what the Admin route answers and what the copied
 * create-variant modal expects.
 *
 * `product_id` comes from the URL, never from the body, so a body naming
 * another product cannot move the variant out of the owned product.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateProductVariant>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  const { additional_data, ...rest } = req.validatedBody as
    & HttpTypes.AdminCreateProductVariant
    & { additional_data?: Record<string, unknown> };

  await createProductVariantsWorkflow(req.scope).run({
    input: {
      product_variants: [{ ...rest, product_id: productId }],
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
