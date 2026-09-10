import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";
import { remapKeysForProduct } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../tenant-scope";
import { remapTenantProduct } from "../helpers";

/**
 * `GET /tenants/products/:id` — one of the tenant's own products, in the
 * Admin's retrieve shape. A product another tenant owns answers 404, the same
 * as an id that does not exist: the response never confirms a foreign row.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedProduct(req, req.params.id);

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  });

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${req.params.id}" was not found`,
    );
  }

  res.status(200).json({ product: remapTenantProduct(product) });
};

/**
 * `DELETE /tenants/products/:id` — deletes one of the tenant's own products
 * through Medusa's `deleteProductsWorkflow`, which also removes the module
 * links pointing at it, the tenant-product link included. A foreign id is a
 * 404 and deletes nothing.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const id = req.params.id;

  await assertOwnedProduct(req, id);

  await deleteProductsWorkflow(req.scope).run({
    input: { ids: [id] },
  });

  res.status(200).json({
    id,
    object: "product",
    deleted: true,
  });
};
