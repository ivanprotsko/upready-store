import type { MedusaContainer } from "@medusajs/framework";
import {
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { SEED_REGIONS } from "../data/regions";
import { getSalesChannel } from "./store";
import { getQuery } from "./utils";

export const getStockLocations = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });
  return data;
};

export const getStockLocationsByName = async (container: MedusaContainer) => {
  const stockLocations = await getStockLocations(container);
  return new Map(
    stockLocations.map((stockLocation) => [stockLocation.name, stockLocation]),
  );
};

/**
 * Stock locations are shared between profiles, but the link to a sales channel
 * is not: a channel with no location fulfils nothing. A second profile reuses
 * the locations that are already there and only adds its own link.
 */
export const linkStockLocationsToSalesChannel = async (
  container: MedusaContainer,
) => {
  const salesChannel = await getSalesChannel(container);
  const stockLocations = await getStockLocations(container);

  if (!stockLocations.length) {
    throw new Error(
      "No stock locations in this database, so the sales channel would have nothing to fulfil from. Seed the shared data first.",
    );
  }

  for (const stockLocation of stockLocations) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [salesChannel.id] },
    });
  }
};

export const seedStockLocations = async (container: MedusaContainer) => {
  await createStockLocationsWorkflow(container).run({
    input: {
      locations: SEED_REGIONS.map((seedRegion) => seedRegion.stock_location),
    },
  });

  await linkStockLocationsToSalesChannel(container);
};
