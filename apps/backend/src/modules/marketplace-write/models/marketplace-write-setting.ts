import { model } from "@medusajs/framework/utils";

/**
 * The shop's write switch, one row per marketplace (w20-wb-write-core).
 *
 * Gate (c). Off by default and off everywhere today: a shop with no row is a
 * shop that cannot write, which is why the reader treats a missing row as
 * `false` rather than creating one.
 */
const MarketplaceWriteSetting = model
  .define("marketplace_write_setting", {
    id: model.id({ prefix: "mwset" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    is_enabled: model.boolean().default(false),
    /** Who last flipped it. */
    updated_by: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default MarketplaceWriteSetting;
