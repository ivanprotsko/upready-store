import type { MedusaContainer } from "@medusajs/framework";
import { createInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";
import { getStockLocations } from "./stock-locations";
import { getQuery } from "./utils";

const STOCKED_QUANTITY = 1000000;

/**
 * One level per (inventory item x stock location), minus the pairs that already
 * have one. `inventory_level` is unique on that pair, so a second profile
 * seeding into the same database would otherwise fail on the first profile's
 * items rather than stock its own.
 */
export const seedInventoryLevels = async (container: MedusaContainer) => {
  const query = getQuery(container);

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });
  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id"],
  });
  const stockLocations = await getStockLocations(container);

  const stocked = new Set(
    existingLevels.map(
      (level) => `${level.inventory_item_id}:${level.location_id}`,
    ),
  );

  const inventory_levels = inventoryItems.flatMap((inventoryItem) =>
    stockLocations
      .filter(
        (stockLocation) =>
          !stocked.has(`${inventoryItem.id}:${stockLocation.id}`),
      )
      .map((stockLocation) => ({
        location_id: stockLocation.id,
        stocked_quantity: STOCKED_QUANTITY,
        inventory_item_id: inventoryItem.id,
      })),
  );

  if (!inventory_levels.length) return;

  await createInventoryLevelsWorkflow(container).run({
    input: { inventory_levels },
  });
};
