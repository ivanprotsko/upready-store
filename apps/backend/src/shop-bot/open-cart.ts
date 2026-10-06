/**
 * Which cart is "the buyer's cart in this shop" (t-cherk-23). The bot's `/cart`
 * (`./medusa-shop.ts`) and the storefront's Mini App entry
 * (`./cart-adoption.ts`) both read it through this file, so the cart a buyer
 * fills in the chat is the one the site opens for them. That cart is this
 * customer's newest cart in this shop's sales channel that is not completed.
 */

export type CartOwner = { customerId: string; salesChannelId: string };

export type OpenCartRow = {
  id?: string | null;
  customer_id?: string | null;
  sales_channel_id?: string | null;
  completed_at?: string | Date | null;
};

/** The owner and the channel, the two fields `pickOwnedOpenCart` checks on every row. */
export const CART_OWNER_FIELDS = ["id", "customer_id", "sales_channel_id", "completed_at"];

/** The `query.graph` arguments for one buyer's carts in one shop, newest first. */
export const newestCartsQuery = (fields: string[], owner: CartOwner) => ({
  entity: "cart",
  fields,
  filters: { customer_id: owner.customerId, sales_channel_id: owner.salesChannelId },
  pagination: { take: 10, order: { created_at: "DESC" } },
});

/**
 * The first open cart of this owner among rows already sorted newest first.
 * The query filters by customer and channel, and this checks both again on
 * each row. A filter that stops matching would otherwise hand one buyer's
 * cart, or another shop's cart, to the caller.
 */
export const pickOwnedOpenCart = <T extends OpenCartRow>(rows: T[], owner: CartOwner): T | null =>
  rows.find(
    (row) =>
      Boolean(row.id) &&
      row.customer_id === owner.customerId &&
      row.sales_channel_id === owner.salesChannelId &&
      !row.completed_at,
  ) ?? null;
