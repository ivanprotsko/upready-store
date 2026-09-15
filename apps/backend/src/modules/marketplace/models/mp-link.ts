import { model } from "@medusajs/framework/utils";

/**
 * One marketplace listing tied to one product of the shop
 * (w12-marketplace-core, spec 2.4).
 *
 * Three outcomes of the matcher, and all three are visible to the owner:
 * exactly one match writes a row with `matched_by = 'vendor_code'`; no match
 * leaves the card in "не связано"; MORE THAN ONE match writes NO row and
 * leaves the card in "требует выбора". Taking the first of several silently
 * would be a value substituted for an absence (rule 20a), and it is the one
 * thing the matcher must not do.
 *
 * This is not `product_marketplace_link` (w07): that row belongs to the shop's
 * catalog and answers "which card did this product's description come from",
 * for an enrichment that also runs where no key exists. This row belongs to
 * the marketplace side and answers "which product of the shop is this card",
 * per `mp_product`, and it carries the confidence and the rule that produced
 * it. They are kept apart on purpose; `link.ts` says so at greater length.
 */
const MpLink = model
  .define("mp_link", {
    id: model.id({ prefix: "mplink" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    /** The `mp_product.external_id` this link is for. */
    external_id: model.text(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
    /** `vendor_code` | `manual`. Why this card got that product. */
    matched_by: model.text(),
    /** 1 for an exact single match; a person's choice is also 1. */
    confidence: model.number().default(1),
    linked_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "product_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpLink;
