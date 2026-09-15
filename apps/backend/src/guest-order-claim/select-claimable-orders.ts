/**
 * Which guest orders an account may take over.
 *
 * A guest checkout writes the buyer's address onto the order and, in Medusa
 * 2.19, hangs it on a `has_account: false` customer row created for that email
 * (`findOrCreateCustomerStep` in the cart completion flow). Registering later
 * with the same address creates a SECOND customer row, this one with an
 * account, and `GET /store/orders` filters by `customer_id` alone — so the
 * order the buyer just placed is invisible in the account they just made.
 *
 * This module holds the one decision that matters, kept free of the container
 * so it can be read, argued with and unit tested on its own: given the orders
 * that carry an email and the account asking for them, which of them move.
 *
 * Every rule here is a rule about who must NOT see an order. They are applied
 * on top of the database filter rather than instead of it, because a filter is
 * a query and this is the gate.
 */

export type ClaimableOrderRow = {
  id: string;
  display_id?: number | null;
  email?: string | null;
  customer_id?: string | null;
  sales_channel_id?: string | null;
  status?: string | null;
  canceled_at?: string | Date | null;
  is_draft_order?: boolean | null;
  /** The order's current owner, as `query.graph` returns it. */
  customer?: { id?: string | null; has_account?: boolean | null } | null;
};

export type SelectClaimableOrdersInput = {
  orders: ClaimableOrderRow[];
  /** The email of the account asking. It is the account's identity, not a parameter of the request. */
  accountEmail: string;
  /** The customer id of that account. */
  accountCustomerId: string;
  /** The sales channels of the storefront making the call, from its publishable key. */
  salesChannelIds: string[];
};

/**
 * An email address is compared case-insensitively and without surrounding
 * space. `Ivan@Example.com` at the checkout and `ivan@example.com` at the
 * registration are one person, and a shop that says otherwise is the bug this
 * whole module exists to fix.
 */
export const normalizeEmail = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toLowerCase() : "";

export const selectClaimableOrders = ({
  orders,
  accountEmail,
  accountCustomerId,
  salesChannelIds,
}: SelectClaimableOrdersInput): ClaimableOrderRow[] => {
  const wanted = normalizeEmail(accountEmail);

  // No email, no claim. An account without an address cannot match anything,
  // and an empty string would otherwise match every order whose email is null
  // once both sides are normalized to "".
  if (!wanted || !accountCustomerId || !salesChannelIds.length) {
    return [];
  }

  const allowedChannels = new Set(salesChannelIds);

  return orders.filter((order) => {
    // 1. The address is the proof of ownership and the only one there is.
    if (normalizeEmail(order.email) !== wanted) {
      return false;
    }

    // 2. The shop asking must be the shop the order was placed in. A customer
    //    account is store-wide on this stack, so without this a buyer opening
    //    shop A would pull in the orders they placed at shop B.
    if (!order.sales_channel_id || !allowedChannels.has(order.sales_channel_id)) {
      return false;
    }

    // 3. Already this account's order. Nothing to move, and moving it would
    //    write a pointless update onto every call.
    if (order.customer_id === accountCustomerId) {
      return false;
    }

    // 4. The order must currently belong to NOBODY or to a guest. An order
    //    that already sits in a registered account is somebody's property and
    //    is never taken from them here: that case is what Medusa's own
    //    token-by-email transfer flow is for.
    const owner = order.customer;
    const ownedByAccount = order.customer_id && owner?.has_account === true;
    if (ownedByAccount) {
      return false;
    }

    // 5. A draft order is the shop owner's document, not the buyer's order.
    if (order.is_draft_order) {
      return false;
    }

    // 6. A cancelled order is history. Attaching it to a fresh account would
    //    put a dead row at the top of the buyer's list.
    if (order.canceled_at || order.status === "canceled") {
      return false;
    }

    return true;
  });
};
