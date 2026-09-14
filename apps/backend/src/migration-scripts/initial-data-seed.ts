import type { MedusaContainer } from "@medusajs/framework";
import {
  linkStockLocationsToSalesChannel,
  markProfileSeeded,
  resolveSeedMode,
  seedCategories,
  seedCollections,
  seedFulfillment,
  seedInventoryLevels,
  seedProductOptionMetadata,
  seedProductOptions,
  seedProducts,
  seedRegions,
  seedSalesChannel,
  seedStockLocations,
  seedStore,
  seedTaxRegions,
  seedTranslations,
  step,
} from "./lib";

/**
 * Seeds one store profile. Run it twice against the same database with two
 * different `STORE_PROFILE` values and the second run adds a profile rather
 * than a second store: the store, the 241 regions, their tax regions, stock
 * locations and fulfillment sets are shared, and only the parts that make a
 * profile its own — sales channel, publishable key, catalog, prices,
 * translations, inventory — are seeded again. `resolveSeedMode` reads which
 * case it is out of the database.
 */
export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const mode = await resolveSeedMode(container);
  if (mode === "skip") return;

  if (mode === "full") {
    await step(seedStore(container), "store data");
    await step(seedRegions(container), "regions");
    await step(seedTaxRegions(container), "tax regions");
    await step(seedStockLocations(container), "stock locations");
    await step(seedFulfillment(container), "fulfillment data");
  } else {
    await step(seedSalesChannel(container), "sales channel and publishable key");
    await step(
      linkStockLocationsToSalesChannel(container),
      "sales channel stock locations",
    );
  }

  await step(seedCategories(container), "product categories");
  await step(seedProductOptions(container), "product options");
  await step(seedProducts(container), "products");
  await step(seedProductOptionMetadata(container), "product option metadata");
  await step(seedCollections(container), "product collections");
  await step(seedTranslations(container, mode), "translations");
  await step(seedInventoryLevels(container), "inventory levels");

  // Last: the stamp `resolveSeedMode` reads. Anything that throws above leaves
  // the profile unstamped, so the next run resumes it instead of calling it done.
  await step(markProfileSeeded(container), "profile completion stamp");
}
