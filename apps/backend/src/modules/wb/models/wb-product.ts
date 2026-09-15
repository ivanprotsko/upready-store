import { model } from "@medusajs/framework/utils";

/**
 * One Wildberries listing ("карточка товара") of one shop, as WB returned it
 * (w01-wb-readonly-client).
 *
 * This is a MIRROR, never a source of truth: the row is what
 * `POST /content/v2/get/cards/list` answered at `fetched_at`, and nothing in
 * this repository ever writes it back to WB. Ivan's order of 2026-09-16 02:46
 * WITA: data flows WB -> our database and never the other way.
 *
 * Scope is the `tenant_id` column, the same shape `product_review` uses: one
 * backend serves every shop, and a WB cabinet belongs to a shop. `nm_id` is
 * WB's own item number and is unique inside a cabinet, which is what makes the
 * import idempotent — a re-run updates the row instead of adding a second one.
 *
 * `raw` is the card exactly as received. The named columns are a convenience
 * for the panel and for queries; anything WB adds later is already in `raw`,
 * so a new field is a migration we can take at our own pace, never lost data.
 */
const WbProduct = model
  .define("wb_product", {
    id: model.id({ prefix: "wbprod" }).primaryKey(),
    tenant_id: model.text(),
    /**
     * WB item number (`nmID`). Unique per cabinet.
     *
     * Text, not a number: WB's item numbers run past 4e10 (the docs' own
     * example is `filterNmID=44589768676`), which does not fit a 32-bit
     * integer column, and nothing here ever does arithmetic on one. Every WB
     * identifier in these tables is stored the same way for the same reason.
     */
    nm_id: model.text(),
    /** WB item group (`imtID`): the sizes of one item share it. */
    imt_id: model.text().nullable(),
    /** The seller's own article (`vendorCode`). */
    vendor_code: model.text().nullable(),
    title: model.text().nullable(),
    brand: model.text().nullable(),
    subject_id: model.text().nullable(),
    subject_name: model.text().nullable(),
    /** `photos[]` as WB returns it: an object of size variants per photo. */
    photos: model.json().nullable(),
    /** `dimensions`: length, width, height, weightBrutto and their unit. */
    dimensions: model.json().nullable(),
    /** `sizes[]`: `chrtID`, `techSize`, `wbSize`, `skus[]` (the barcodes). */
    sizes: model.json().nullable(),
    /** Always `wb` here; the column exists so a second marketplace can share the table shape. */
    source: model.text().default("wb"),
    /** When THIS row was read from WB, not when the card changed there. */
    fetched_at: model.dateTime(),
    /** WB's own `updatedAt` for the card, when it sent one. */
    wb_updated_at: model.dateTime().nullable(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "nm_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbProduct;
