import {
  normalizeEmail,
  selectClaimableOrders,
  type ClaimableOrderRow,
} from "../select-claimable-orders";

const CHANNEL = "sc_shop_a";
const OTHER_CHANNEL = "sc_shop_b";
const ACCOUNT = "cus_account";

const guestOrder = (overrides: Partial<ClaimableOrderRow> = {}): ClaimableOrderRow => ({
  id: "order_1",
  display_id: 5,
  email: "buyer@example.com",
  customer_id: "cus_guest",
  sales_channel_id: CHANNEL,
  status: "pending",
  canceled_at: null,
  is_draft_order: false,
  customer: { id: "cus_guest", has_account: false },
  ...overrides,
});

const select = (orders: ClaimableOrderRow[], accountEmail = "buyer@example.com") =>
  selectClaimableOrders({
    orders,
    accountEmail,
    accountCustomerId: ACCOUNT,
    salesChannelIds: [CHANNEL],
  }).map((order) => order.id);

describe("selectClaimableOrders", () => {
  it("claims a guest order carrying the account's own email", () => {
    expect(select([guestOrder()])).toEqual(["order_1"]);
  });

  it("claims an order that has no customer at all", () => {
    expect(select([guestOrder({ customer_id: null, customer: null })])).toEqual(["order_1"]);
  });

  it("matches the email case-insensitively and ignores surrounding space", () => {
    expect(select([guestOrder({ email: "  Buyer@Example.COM " })])).toEqual(["order_1"]);
  });

  // The negative the task asks to be proved: another address never reaches
  // this order, whatever else it has in common with it.
  it("refuses an order whose email is not the account's", () => {
    expect(select([guestOrder({ email: "someone.else@example.com" })])).toEqual([]);
  });

  it("refuses an order with no email", () => {
    expect(select([guestOrder({ email: null })])).toEqual([]);
  });

  it("refuses everything when the account has no email", () => {
    expect(select([guestOrder()], "")).toEqual([]);
  });

  it("refuses an order placed in another shop's sales channel", () => {
    expect(select([guestOrder({ sales_channel_id: OTHER_CHANNEL })])).toEqual([]);
  });

  it("refuses an order with no sales channel", () => {
    expect(select([guestOrder({ sales_channel_id: null })])).toEqual([]);
  });

  // The address alone is not enough once somebody has an account on it: taking
  // the order back would be a way of stealing an order from a registered buyer
  // by registering the same address twice.
  it("refuses an order that already belongs to a registered account", () => {
    expect(
      select([guestOrder({ customer_id: "cus_other", customer: { id: "cus_other", has_account: true } })]),
    ).toEqual([]);
  });

  it("refuses an order this account already owns", () => {
    expect(
      select([guestOrder({ customer_id: ACCOUNT, customer: { id: ACCOUNT, has_account: true } })]),
    ).toEqual([]);
  });

  it("refuses a draft order", () => {
    expect(select([guestOrder({ is_draft_order: true })])).toEqual([]);
  });

  it("refuses a cancelled order, by timestamp or by status", () => {
    expect(select([guestOrder({ canceled_at: "2026-09-15T02:00:00.000Z" })])).toEqual([]);
    expect(select([guestOrder({ status: "canceled" })])).toEqual([]);
  });

  it("returns nothing when the caller carries no sales channel", () => {
    expect(
      selectClaimableOrders({
        orders: [guestOrder()],
        accountEmail: "buyer@example.com",
        accountCustomerId: ACCOUNT,
        salesChannelIds: [],
      }),
    ).toEqual([]);
  });

  it("picks the claimable orders out of a mixed list", () => {
    const orders = [
      guestOrder({ id: "order_mine_1" }),
      guestOrder({ id: "order_other_email", email: "nope@example.com" }),
      guestOrder({ id: "order_other_shop", sales_channel_id: OTHER_CHANNEL }),
      guestOrder({ id: "order_mine_2", customer_id: null, customer: null }),
    ];
    expect(select(orders)).toEqual(["order_mine_1", "order_mine_2"]);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims a string", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });

  it("answers an empty string for anything that is not one", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});
