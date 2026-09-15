import { model } from "@medusajs/framework/utils";

/**
 * One Ozon product card of one shop, as Ozon returned it
 * (w11-ozon-readonly-client).
 *
 * This is a MIRROR, never a source of truth: the row is what
 * `POST /v3/product/list` plus `POST /v3/product/info/list` answered at
 * `fetched_at`, and nothing in this repository ever writes it back. Ivan's
 * order of 2026-09-16 02:46 WITA: data flows Ozon -> our database and never
 * the other way. Creating or updating a card on Ozon is
 * `POST /v3/product/import`, which stands in `OZON_WRITE_PATHS` and can never
 * be registered.
 *
 * Scope is `tenant_id`, the same shape `wb_product` uses. Identity is
 * `product_id`, Ozon's own id of the card inside the cabinet.
 *
 * `offer_id` is the seller's own article. It is the SAME value as WB's
 * `vendorCode` and as the shop's SKU (recorded 2026-09-16 in
 * `upready-store-marketplace-api-facts-2026-09-16.md`), which is what will let
 * a later task link a card to a shop product without hand work.
 *
 * Every Ozon identifier is stored as text, not as a number: `product_id` and
 * `sku` run past 4e9 in Ozon's own examples (`sku: 9880276314`) and nothing
 * here does arithmetic on one.
 */
const OzonProduct = model
  .define("ozon_product", {
    id: model.id({ prefix: "ozprod" }).primaryKey(),
    tenant_id: model.text(),
    /** Ozon's id of the card inside the cabinet (`product_id`). */
    product_id: model.text(),
    /** The seller's own article (`offer_id`). Equals the shop SKU and WB `vendorCode`. */
    offer_id: model.text().nullable(),
    /** Ozon's id of the item on the site (`sku`). */
    sku: model.text().nullable(),
    name: model.text().nullable(),
    /** From `POST /v1/product/info/description`, when that import ran. */
    description: model.text().nullable(),
    barcodes: model.json().nullable(),
    /** `description_category_id` and `type_id`, Ozon's own category coordinates. */
    category_id: model.text().nullable(),
    type_id: model.text().nullable(),
    images: model.json().nullable(),
    primary_image: model.text().nullable(),
    /** `statuses` verbatim: moderation state, visibility, when Ozon last changed it. */
    statuses: model.json().nullable(),
    /** `POST /v4/product/info/attributes` result for this card, when that import ran. */
    attributes: model.json().nullable(),
    archived: model.boolean().default(false),
    /** Always `ozon` here; the column exists so the table shape matches `wb_product`. */
    source: model.text().default("ozon"),
    /** When THIS row was read from Ozon, not when the card changed there. */
    fetched_at: model.dateTime(),
    /** Ozon's own `updated_at` for the card, when it sent one. */
    ozon_updated_at: model.dateTime().nullable(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonProduct;
