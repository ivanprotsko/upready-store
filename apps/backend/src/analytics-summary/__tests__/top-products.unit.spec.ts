import { currentVersionRows, topProductsFromItemRows, type OrderItemRow } from "../top-products";

/**
 * Fixture Б of b12-analytics-accuracy. The stand order `order_b12b1jf9hvn`
 * (database `upready_store_b12`) was created with one line of 2 pieces at
 * ₽500 and then edited to 3 pieces through Medusa's own order-edit workflows.
 * `order.version` became 2 and `order_item` kept both rows — measured:
 * `v1×2, v2×3`.
 *
 * A sum over `order_id` alone therefore reports 5 pieces and ₽2 500 (measured
 * with SQL on the stand), where the shop sold 3 pieces for ₽1 500.
 */
const EDITED_ORDER: OrderItemRow[] = [
  {
    order_id: "order_b12b1jf9hvn",
    order_version: 2,
    item_version: 1,
    product_id: "prod_sorbent",
    title: "Натуральный сорбент от отравлений от температуры",
    quantity: 2,
    unit_price: 500,
  },
  {
    order_id: "order_b12b1jf9hvn",
    order_version: 2,
    item_version: 2,
    product_id: "prod_sorbent",
    title: "Натуральный сорбент от отравлений от температуры",
    quantity: 3,
    unit_price: 500,
  },
];

/** A real three-version order from the same database (`order_01M2640GHNN75FE6C4A4A5ZX18`). */
const THRICE_EDITED_ORDER: OrderItemRow[] = [1, 2, 3].flatMap((version) => [
  {
    order_id: "order_01M2640GHNN75FE6C4A4A5ZX18",
    order_version: 3,
    item_version: version,
    product_id: "prod_shirt",
    title: "Acme shirt (live)",
    quantity: 1,
    unit_price: 10,
  },
  {
    order_id: "order_01M2640GHNN75FE6C4A4A5ZX18",
    order_version: 3,
    item_version: version,
    product_id: "prod_mug",
    title: "Globex mug (live)",
    quantity: 1,
    unit_price: 10,
  },
]);

describe("currentVersionRows", () => {
  it("keeps only the rows of the version the order is on now", () => {
    expect(currentVersionRows(EDITED_ORDER).map((row) => row.item_version)).toEqual([2]);
  });

  it("keeps every line of an order edited more than once, exactly once each", () => {
    const rows = currentVersionRows(THRICE_EDITED_ORDER);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.product_id).sort()).toEqual(["prod_mug", "prod_shirt"]);
  });
});

describe("topProductsFromItemRows", () => {
  it("counts an edited order once, at its current quantity", () => {
    expect(topProductsFromItemRows(EDITED_ORDER)).toEqual([
      {
        product_id: "prod_sorbent",
        title: "Натуральный сорбент от отравлений от температуры",
        quantity: 3,
        revenue: 1500,
      },
    ]);
  });

  it("does not report the doubled figures a version-blind sum produces", () => {
    const blind = EDITED_ORDER.reduce(
      (acc, row) => ({
        quantity: acc.quantity + row.quantity,
        revenue: acc.revenue + row.quantity * row.unit_price,
      }),
      { quantity: 0, revenue: 0 },
    );

    expect(blind).toEqual({ quantity: 5, revenue: 2500 });
    expect(topProductsFromItemRows(EDITED_ORDER)[0]).toMatchObject({ quantity: 3, revenue: 1500 });
  });

  it("does not triple an order that has been through three versions", () => {
    expect(topProductsFromItemRows(THRICE_EDITED_ORDER)).toEqual([
      { product_id: "prod_shirt", title: "Acme shirt (live)", quantity: 1, revenue: 10 },
      { product_id: "prod_mug", title: "Globex mug (live)", quantity: 1, revenue: 10 },
    ]);
  });

  it("drops a line the owner removed in the edit, because it has no current-version row", () => {
    const withRemovedLine: OrderItemRow[] = [
      ...EDITED_ORDER,
      {
        order_id: "order_b12b1jf9hvn",
        order_version: 2,
        item_version: 1,
        product_id: "prod_removed",
        title: "Убранный из заказа товар",
        quantity: 4,
        unit_price: 100,
      },
    ];

    expect(topProductsFromItemRows(withRemovedLine).map((row) => row.product_id)).toEqual([
      "prod_sorbent",
    ]);
  });

  it("sums the same product across orders and ranks by revenue", () => {
    const rows: OrderItemRow[] = [
      {
        order_id: "o1",
        order_version: 1,
        item_version: 1,
        product_id: "p_a",
        title: "A",
        quantity: 2,
        unit_price: 100,
      },
      {
        order_id: "o2",
        order_version: 1,
        item_version: 1,
        product_id: "p_a",
        title: "A",
        quantity: 1,
        unit_price: 100,
      },
      {
        order_id: "o3",
        order_version: 1,
        item_version: 1,
        product_id: "p_b",
        title: "B",
        quantity: 10,
        unit_price: 50,
      },
    ];

    expect(topProductsFromItemRows(rows)).toEqual([
      { product_id: "p_b", title: "B", quantity: 10, revenue: 500 },
      { product_id: "p_a", title: "A", quantity: 3, revenue: 300 },
    ]);
  });

  it("skips a line with no product and caps the list at five", () => {
    const rows: OrderItemRow[] = [
      {
        order_id: "o0",
        order_version: 1,
        item_version: 1,
        product_id: null,
        title: "Доставка",
        quantity: 1,
        unit_price: 300,
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        order_id: `o${index + 1}`,
        order_version: 1,
        item_version: 1,
        product_id: `p_${index}`,
        title: `P${index}`,
        quantity: 1,
        unit_price: (index + 1) * 10,
      })),
    ];

    const top = topProductsFromItemRows(rows);

    expect(top).toHaveLength(5);
    expect(top.map((row) => row.product_id)).toEqual(["p_5", "p_4", "p_3", "p_2", "p_1"]);
  });

  it("is empty when the period has no item rows at all", () => {
    expect(topProductsFromItemRows([])).toEqual([]);
  });
});
