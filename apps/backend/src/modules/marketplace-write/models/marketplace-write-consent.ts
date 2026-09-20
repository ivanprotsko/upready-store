import { model } from "@medusajs/framework/utils";

/**
 * The owner's consent to ONE class of operations on ONE marketplace
 * (w20-wb-write-core, Ivan's order of 2026-09-16 04:44 WITA: "подтверждение
 * владелицы на каждый класс операций").
 *
 * A row is the consent. Revoking is deleting it, so a shop whose rows are all
 * gone is a shop where gate (d) refuses everything — the state the platform
 * is in today.
 *
 * `confirmed_by` is the actor id that pressed the button and `note` is what
 * the dialog told them they were confirming, kept verbatim so a later
 * question about "what was she shown" has an answer.
 */
const MarketplaceWriteConsent = model
  .define("marketplace_write_consent", {
    id: model.id({ prefix: "mwcon" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    op_class: model.text(),
    confirmed_by: model.text(),
    confirmed_at: model.dateTime(),
    note: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "op_class"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default MarketplaceWriteConsent;
