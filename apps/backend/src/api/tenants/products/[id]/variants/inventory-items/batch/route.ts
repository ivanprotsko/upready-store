import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { batchLinksWorkflow } from "@medusajs/medusa/core-flows";
import { buildBatchVariantInventoryData } from "@medusajs/medusa/api/admin/products/helpers";
import { assertOwnedProduct } from "../../../../../tenant-scope";
import { assertOwnedInventoryItems, assertProductVariant } from "../../../../helpers";

type VariantInventoryRow = {
  variant_id: string;
  inventory_item_id: string;
  required_quantity?: number;
};

type BatchVariantInventoryBody = {
  create?: VariantInventoryRow[];
  update?: VariantInventoryRow[];
  delete?: VariantInventoryRow[];
};

/**
 * `POST /tenants/products/:id/variants/inventory-items/batch` — the
 * variant-to-inventory-item links the copied inventory-kit forms save in one
 * call. Mirrors the Admin route, including its use of the Admin's own
 * `buildBatchVariantInventoryData` to turn rows into link definitions.
 *
 * Every row names both a variant and an inventory item, and the workflow takes
 * them as given, so both sides are checked first: the variant has to belong to
 * the product in the URL and the inventory item has to be one the tenant's own
 * variants already use. An unknown item on either side is a 404 and the batch
 * does not run.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<BatchVariantInventoryBody>,
  res: MedusaResponse,
) => {
  const productId = req.params.id;

  await assertOwnedProduct(req, productId);

  const { create = [], update = [], delete: toDelete = [] } = req.validatedBody;
  const rows = [...create, ...update, ...toDelete];

  for (const variantId of new Set(rows.map((row) => row.variant_id).filter(Boolean))) {
    await assertProductVariant(req, productId, variantId);
  }

  await assertOwnedInventoryItems(req, [
    ...new Set([...update, ...toDelete].map((row) => row.inventory_item_id).filter(Boolean)),
  ]);

  const { result } = await batchLinksWorkflow(req.scope).run({
    input: {
      create: buildBatchVariantInventoryData(create),
      update: buildBatchVariantInventoryData(update),
      delete: buildBatchVariantInventoryData(toDelete),
    },
  });

  res.status(200).json({
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
  });
};
