import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createLinksWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { refetchVariant } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../../tenant-scope";
import { assertProductVariant } from "../../../../helpers";

/**
 * `POST /tenants/products/:id/variants/:variant_id/inventory-items` — links one
 * inventory item to one variant with a required quantity (the copied
 * manage-inventory-items dialog). Mirrors the Admin route.
 *
 * The item may be an item the tenant has not used before, which is how a new
 * kit component is added, so only the variant side is an ownership question
 * here. Inventory items are shared across the installation by design (the
 * inventory module has no tenant of its own); `GET /tenants/inventory-items`
 * already limits the list the form picks from to items the tenant's variants
 * use.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ inventory_item_id: string; required_quantity?: number }>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);

  await createLinksWorkflow(req.scope).run({
    input: [
      {
        [Modules.PRODUCT]: { variant_id: variantId },
        [Modules.INVENTORY]: { inventory_item_id: req.validatedBody.inventory_item_id },
        data: { required_quantity: req.validatedBody.required_quantity },
      },
    ],
  });

  const variant = await refetchVariant(variantId, req.scope, req.queryConfig.fields);

  res.status(200).json({ variant });
};
