/**
 * The five best-selling products of a period, counted on the CURRENT version
 * of every order line (b12-analytics-accuracy, round-1 finding 5).
 *
 * `order_item` is versioned exactly like `order_summary`: editing an order
 * appends a whole new set of rows, one per line, carrying the new
 * `version`, and `order.version` is the pointer to the current one. Measured
 * on the stand (`upready_store_b12`, an order edited from 2 to 3 pieces
 * through Medusa's own `confirmOrderEditRequestWorkflow`): `order_item` holds
 * `v1 × 2` and `v2 × 3`, so a sum over `order_id` alone reports 5 pieces and
 * ₽2 500 where the shop sold 3 pieces for ₽1 500. An order edited twice
 * triples, and so on — a real three-version order in the same database
 * carries each of its lines three times.
 *
 * Medusa copies EVERY surviving line into the new version
 * (`@medusajs/order` 2.19, `dist/utils/apply-order-changes.js`: each item of
 * the recalculated order is upserted with `version` and a fresh id), and skips
 * a line whose quantity has dropped to zero. So keeping only the rows whose
 * `version` equals the order's is the whole rule: nothing that is still in the
 * order is lost, and a line the owner removed does not linger.
 *
 * The filter lives here rather than in the SQL join so that it is measurable
 * without a database — the same reason `order-totals.ts` holds the summary
 * join in one place.
 */

/** One `order_item` row joined to its line item and to its order's version. */
export type OrderItemRow = {
  order_id: string;
  /** `order.version` — the version that IS the order today. */
  order_version: number;
  /** `order_item.version` — the version this row belongs to. */
  item_version: number;
  product_id: string | null;
  title: string | null;
  quantity: number;
  unit_price: number;
};

export type TopProduct = {
  product_id: string;
  title: string;
  quantity: number;
  revenue: number;
};

export const TOP_PRODUCTS_LIMIT = 5;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Rows that belong to the version their order is on right now. */
export const currentVersionRows = (rows: OrderItemRow[]): OrderItemRow[] =>
  rows.filter((row) => row.item_version === row.order_version);

/**
 * Quantity and revenue per product over the current version of every line,
 * richest first (then by quantity, then by title, so equal money keeps a
 * stable order), capped at `limit`.
 */
export const topProductsFromItemRows = (
  rows: OrderItemRow[],
  limit: number = TOP_PRODUCTS_LIMIT,
): TopProduct[] => {
  const byProduct = new Map<string, { title: string; quantity: number; revenue: number }>();

  for (const row of currentVersionRows(rows)) {
    if (!row.product_id) {
      continue;
    }

    const entry = byProduct.get(row.product_id) ?? {
      title: row.title ?? "",
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += row.quantity;
    entry.revenue += row.quantity * row.unit_price;
    byProduct.set(row.product_id, entry);
  }

  return [...byProduct.entries()]
    .map(([product_id, entry]) => ({
      product_id,
      title: entry.title,
      quantity: round2(entry.quantity),
      revenue: round2(entry.revenue),
    }))
    .sort(
      (a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
};
