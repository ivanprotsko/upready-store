import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { dismissLinksWorkflow, updateLinksWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { refetchVariant } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../../../tenant-scope";
import { assertOwnedInventoryItems, assertProductVariant } from "../../../../../helpers";

/**
 * `POST …/variants/:variant_id/inventory-items/:inventory_item_id` — changes the
 * required quantity on one existing variant-to-item link. Mirrors the Admin
 * route. Both sides are checked: the variant belongs to the owned product, and
 * the item is already used by one of the tenant's own variants.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ required_quantity?: number }>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;
  const inventoryItemId = req.params.inventory_item_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);
  await assertOwnedInventoryItems(req, [inventoryItemId]);

  await updateLinksWorkflow(req.scope).run({
    input: [
      {
        [Modules.PRODUCT]: { variant_id: variantId },
        [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
        data: { required_quantity: req.validatedBody.required_quantity },
      },
    ],
  });

  const variant = await refetchVariant(variantId, req.scope, req.queryConfig.fields);

  res.status(200).json({ variant });
};

/** `DELETE …/variants/:variant_id/inventory-items/:inventory_item_id`. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id;
  const variantId = req.params.variant_id;
  const inventoryItemId = req.params.inventory_item_id;

  await assertOwnedProduct(req, productId);
  await assertProductVariant(req, productId, variantId);
  await assertOwnedInventoryItems(req, [inventoryItemId]);

  const {
    result: [deleted],
  } = await dismissLinksWorkflow(req.scope).run({
    input: [
      {
        [Modules.PRODUCT]: { variant_id: variantId },
        [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
      },
    ],
  });

  const parent = await refetchVariant(variantId, req.scope, req.queryConfig.fields);

  res.status(200).json({
    id: deleted,
    object: "variant-inventory-item-link",
    deleted: true,
    parent,
  });
};
