import { collectPendingProducts } from "../store-course-helpers";
import type { OrderForPendingCourse } from "../store-course-helpers";

const order = (overrides: Partial<OrderForPendingCourse>): OrderForPendingCourse => ({
  id: "order_1",
  display_id: 1001,
  status: "pending",
  payment_status: "not_paid",
  items: [{ product_id: "prod_course" }],
  ...overrides,
});

describe("collectPendingProducts", () => {
  it("names a product awaiting payment on a live order", () => {
    const result = collectPendingProducts([order({})]);
    expect(result.get("prod_course")).toEqual({ id: "order_1", display_id: 1001 });
  });

  it("ignores a cancelled order", () => {
    const result = collectPendingProducts([order({ status: "canceled" })]);
    expect(result.size).toBe(0);
  });

  it("ignores an order captured, partially captured, refunded or partially refunded at least once", () => {
    for (const payment_status of ["captured", "partially_captured", "refunded", "partially_refunded"]) {
      const result = collectPendingProducts([order({ payment_status })]);
      expect(result.size).toBe(0);
    }
  });

  it("keeps a product pending while its order is merely authorized or awaiting", () => {
    for (const payment_status of ["authorized", "partially_authorized", "awaiting", "requires_action", "not_paid"]) {
      const result = collectPendingProducts([order({ payment_status })]);
      expect(result.get("prod_course")).toEqual({ id: "order_1", display_id: 1001 });
    }
  });

  it("keeps the earliest unpaid order for a product a buyer ordered twice", () => {
    const result = collectPendingProducts([
      order({ id: "order_1", display_id: 1001 }),
      order({ id: "order_2", display_id: 1002 }),
    ]);
    expect(result.get("prod_course")).toEqual({ id: "order_1", display_id: 1001 });
  });

  it("skips a line with no product id and an order with no items loaded", () => {
    const result = collectPendingProducts([
      order({ items: [{ product_id: null }, null] }),
      order({ id: "order_3", items: null }),
    ]);
    expect(result.size).toBe(0);
  });

  it("is empty for no orders", () => {
    expect(collectPendingProducts([]).size).toBe(0);
  });
});
