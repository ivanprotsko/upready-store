import { model } from "@medusajs/framework/utils";

/**
 * One sale or return line from WB statistics, mirrored from
 * `GET /api/v1/supplier/sales` (w03-wb-sales-questions-mirror).
 *
 * WB's own notes on that method, quoted from
 * `artifacts/docs/w01-wb-readonly-client/docs/…reports.txt`:
 *
 *   "The method returns sale and return information."
 *   "1 line means 1 sale/return and means 1 item. The srid field should be
 *    used to identify the order."
 *   "Data storage is guaranteed for no more than 90 days from the date of sale."
 *
 * `srid` identifies the ORDER, and that is not the identity of a line here:
 * measured against the live cabinet on 2026-09-16 05:12 WITA, one answer of
 * this method carried the same `srid` twice and the import died with
 * "Wb sale with … srid: er.rfa69eccbd134437395a9c3017ccf1393.0.0, already
 * exists". The feed holds sales AND returns ("The method returns sale and
 * return information"), and a return carries the srid of the sale it undoes.
 * So the identity of a LINE is the pair (`srid`, `sale_id`): WB's `saleID` is
 * its own number of the sale or the return.
 *
 * The docs also warn that this feed is preliminary: `finished_price`,
 * `price_with_disc` and `for_pay` "may temporarily have the value 0: data is
 * filled in asynchronously and updated within 24 hours", and accurate money
 * lives in the realization reports. A screen built on this table has to say
 * so rather than present it as accounting.
 */
const WbSale = model
  .define("wb_sale", {
    id: model.id({ prefix: "wbsale" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's unique id of the line. The docs name it as the identity. */
    srid: model.text(),
    /** WB's `saleID`, its own human-facing number of the sale or return. */
    sale_id: model.text().nullable(),
    nm_id: model.text().nullable(),
    supplier_article: model.text().nullable(),
    barcode: model.text().nullable(),
    tech_size: model.text().nullable(),
    category: model.text().nullable(),
    subject: model.text().nullable(),
    brand: model.text().nullable(),
    /** WB's `totalPrice`, before the seller discount. */
    total_price: model.bigNumber().nullable(),
    /** WB's `discountPercent`. */
    discount_percent: model.number().nullable(),
    /** WB's `spp`: the WB-side discount percentage. */
    spp: model.number().nullable(),
    /** WB's `priceWithDisc`: the price after the seller discount. */
    price_with_disc: model.bigNumber().nullable(),
    /** WB's `finishedPrice`: what the customer paid. */
    finished_price: model.bigNumber().nullable(),
    /** WB's `forPay`: what WB pays the seller for this line. */
    for_pay: model.bigNumber().nullable(),
    /** WB's `paymentSaleAmount`. */
    payment_sale_amount: model.bigNumber().nullable(),
    is_supply: model.boolean().nullable(),
    is_realization: model.boolean().nullable(),
    warehouse_name: model.text().nullable(),
    warehouse_type: model.text().nullable(),
    country_name: model.text().nullable(),
    oblast_okrug_name: model.text().nullable(),
    region_name: model.text().nullable(),
    /** WB's `date`: when the sale or return happened. */
    sale_date: model.dateTime().nullable(),
    /** WB's `lastChangeDate`: the cursor the next page starts from. */
    last_change_date: model.dateTime().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "srid", "sale_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "sale_date"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbSale;
