import { model } from "@medusajs/framework/utils";

/**
 * Inventory of one barcode in one seller warehouse, mirrored from
 * `POST /api/v3/stocks/{warehouseId}` — WB's "Get Inventory", a read that
 * takes its `chrtIds` in a body (w01-wb-readonly-client).
 *
 * The identity of a stock line is (warehouse, sku): WB answers with `sku` (the
 * barcode) and `amount`, and the barcodes come from the cards already mirrored
 * in `wb_product.sizes[].skus`. `chrt_id` and `nm_id` are carried alongside so
 * the row can be joined back to the listing without re-reading the card.
 *
 * Never written back: `PUT` and `DELETE` on that same WB path are the update
 * and delete methods, and neither is registered in `endpoints.ts`.
 */
const WbStock = model
  .define("wb_stock", {
    id: model.id({ prefix: "wbstock" }).primaryKey(),
    tenant_id: model.text(),
    /** Seller warehouse id from `GET /api/v3/warehouses`. */
    warehouse_id: model.text(),
    warehouse_name: model.text().nullable(),
    /** The barcode WB calls `sku`. */
    sku: model.text(),
    /** WB size id (`chrtID`), the value asked for in the request body. */
    chrt_id: model.text().nullable(),
    nm_id: model.text().nullable(),
    amount: model.number().default(0),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "warehouse_id", "sku"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbStock;
