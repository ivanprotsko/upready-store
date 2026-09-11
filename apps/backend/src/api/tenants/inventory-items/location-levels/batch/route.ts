import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { batchInventoryItemLevelsWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedInventoryItems } from "../../../products/helpers";

/**
 * `POST /tenants/inventory-items/location-levels/batch` — the one write the
 * copied product-stock screen makes: it saves the whole grid of stocked
 * quantities per variant per location in a single call. Mirrors
 * `@medusajs/medusa/dist/api/admin/inventory-items/location-levels/batch/route.js`.
 *
 * Ownership is the inventory items the tenant's own variants use, the same set
 * `GET /tenants/inventory-items` lists. `create` and `update` name the item
 * directly; `delete` names inventory LEVEL ids, so each one is resolved to its
 * item first. A level or item outside the set is a 404 and nothing is written.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminBatchInventoryItemsLocationLevels>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const namedItemIds = [...(body.create ?? []), ...(body.update ?? [])].map(
    (row) => row.inventory_item_id,
  );

  const levelIds = body.delete ?? [];
  let deletedItemIds: string[] = [];

  if (levelIds.length > 0) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: levels } = await query.graph({
      entity: "inventory_level",
      fields: ["id", "inventory_item_id"],
      filters: { id: levelIds },
    });

    if (levels.length !== new Set(levelIds).size) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "One or more inventory levels were not found",
      );
    }

    deletedItemIds = levels
      .map((level) => level?.inventory_item_id)
      .filter((id): id is string => Boolean(id));
  }

  await assertOwnedInventoryItems(req, [...new Set([...namedItemIds, ...deletedItemIds])]);

  const { result } = await batchInventoryItemLevelsWorkflow(req.scope).run({
    input: body,
  });

  res.json({
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
  });
};
