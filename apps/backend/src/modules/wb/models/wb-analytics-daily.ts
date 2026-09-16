import { model } from "@medusajs/framework/utils";

/**
 * One day of the sales funnel of one listing, mirrored from
 * `POST /api/analytics/v3/sales-funnel/products/history`
 * (w03-wb-sales-questions-mirror).
 *
 * The columns are WB's own, renamed to snake_case and nothing else. WB's
 * `history` entry is exactly: `date`, `openCount`, `cartCount`, `orderCount`,
 * `orderSum`, `buyoutCount`, `buyoutSum`, `buyoutPercent`,
 * `addToCartConversion`, `cartToOrderConversion`, `addToWishlistCount`.
 *
 * Three limits of the method, all of them WB's and all of them visible here:
 *
 *   - "You can get data for a maximum of the last week", so the mirror holds
 *     a rolling week and `period_start`/`period_end` say which window the row
 *     was asked for;
 *   - `nmIds` takes 1 to 20 items per request, so one request covers 20
 *     listings and the run log says how many of the shop's listings that was;
 *   - a base token gets 2 requests per hour on the analytics category.
 *
 * `currency` comes from the answer, not from a guess about the seller.
 */
const WbAnalyticsDaily = model
  .define("wb_analytics_daily", {
    id: model.id({ prefix: "wbanl" }).primaryKey(),
    tenant_id: model.text(),
    nm_id: model.text(),
    /** The day this funnel belongs to, as WB's `date` (YYYY-MM-DD). */
    date: model.text(),
    title: model.text().nullable(),
    vendor_code: model.text().nullable(),
    brand_name: model.text().nullable(),
    subject_id: model.text().nullable(),
    subject_name: model.text().nullable(),
    /** WB's `openCount`: listing card opened. */
    open_card: model.number().nullable(),
    /** WB's `cartCount`: added to cart. */
    add_to_cart: model.number().nullable(),
    /** WB's `orderCount`. */
    orders: model.number().nullable(),
    /** WB's `orderSum`, in `currency`. */
    ordered_sum: model.bigNumber().nullable(),
    /** WB's `buyoutCount`: orders the customer actually took. */
    buyouts: model.number().nullable(),
    /** WB's `buyoutSum`, in `currency`. */
    buyout_sum: model.bigNumber().nullable(),
    /** WB's `buyoutPercent`. */
    buyout_percent: model.number().nullable(),
    /** WB's `addToCartConversion`, a percentage. */
    add_to_cart_percent: model.number().nullable(),
    /** WB's `cartToOrderConversion`, a percentage. */
    cart_to_order_percent: model.number().nullable(),
    /** WB's `addToWishlistCount`. */
    add_to_wishlist: model.number().nullable(),
    currency: model.text().nullable(),
    /** The window this row was asked for, so a short run is never read as a full week. */
    period_start: model.text().nullable(),
    period_end: model.text().nullable(),
    source: model.text().default("wb"),
    fetched_at: model.dateTime(),
    raw: model.json(),
  })
  .indexes([
    {
      on: ["tenant_id", "nm_id", "date"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "date"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbAnalyticsDaily;
