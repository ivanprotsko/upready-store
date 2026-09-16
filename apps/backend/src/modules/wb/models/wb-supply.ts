import { model } from "@medusajs/framework/utils";

/**
 * One FBS supply, mirrored from `GET /api/v3/supplies`
 * (w23-wb-write-fbs-orders).
 *
 * A supply is the box an assembly order is put into: on Wildberries there is
 * no "confirm this order" method at all, and an order reaches the `confirm`
 * status only by being added to a supply. That is why the desk mirrors
 * supplies next to orders rather than treating them as a shipping detail.
 *
 * Identity is WB's own `id` ("WB-GI-1234567"), a string. Field names measured
 * against the live cabinet on 2026-09-16; the doc page renders its samples
 * collapsed.
 */
const WbSupply = model
  .define("wb_supply", {
    id: model.id({ prefix: "wbsup" }).primaryKey(),
    tenant_id: model.text(),
    /** WB's `id`, e.g. `WB-GI-1234567`. */
    supply_id: model.text(),
    /** WB's `name`, the seller's own label for the supply. */
    name: model.text().nullable(),
    /**
     * WB's `done`: the supply has been handed over and is closed. A closed
     * supply accepts no more orders, which is what the desk checks before it
     * offers «Собрать».
     */
    done: model.boolean().default(false),
    /** WB's `cargoType`: a supply holds one dimensional type only. */
    cargo_type: model.number().nullable(),
    /** WB's `destinationOfficeId`: where the supply is going. */
    destination_office_id: model.text().nullable(),
    /** WB's `createdAt`. */
    wb_created_at: model.dateTime().nullable(),
    /** WB's `closedAt`: when it was handed over to the delivery. */
    closed_at: model.dateTime().nullable(),
    /** WB's `scanDt`: when the warehouse scanned its QR code. */
    scan_dt: model.dateTime().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "supply_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default WbSupply;
