import type { Knex } from "@medusajs/framework/mikro-orm/knex";

/**
 * The product weights a carrier order needs and Medusa does not hand over
 * (t-2026-10-14-58). The price weighs a unit by its variant, then its product,
 * then the shop's default (`unitWeightGrams` in `cdek/method.ts`), and the
 * order sent to CDEK or ApiShip must weigh it the same. But the order Medusa
 * 2.19 passes `createFulfillment` (core-flows
 * `order/workflows/create-fulfillment.js`, its `get-order` query) carries
 * `items.variant.weight` and `items.variant.product.id`, and no product weight.
 * So the provider reads the weight of each product whose variant has none and
 * puts it on the line as `variant.product.weight`.
 *
 * One read per fulfillment, and none when every variant has a weight.
 */

type Line = {
  product_id?: string | null;
  variant?: {
    weight?: number | null;
    product?: { id?: string | null; weight?: number | null } | null;
  } | null;
};

const hasOwnWeight = (line: Line): boolean => {
  const own = line.variant?.weight;
  return typeof own === "number" && Number.isFinite(own) && own > 0;
};

const productIdOf = (line: Line): string | null => line.variant?.product?.id || line.product_id || null;

/** The products of the lines whose variant has no weight, each once. */
export const productIdsWithoutVariantWeight = (order: Record<string, unknown> | undefined): string[] => {
  const ids = new Set<string>();
  for (const line of (order?.items ?? []) as Line[]) {
    if (!line || hasOwnWeight(line)) continue;
    const id = productIdOf(line);
    if (id) ids.add(id);
  }
  return [...ids];
};

/** The order with `variant.product.weight` set on every line whose variant has no weight. */
export const withProductWeights = async (
  pg: Knex,
  order: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> => {
  const ids = productIdsWithoutVariantWeight(order);
  if (!order || !ids.length) return order;
  const rows = (await pg("product").whereIn("id", ids).whereNull("deleted_at").select("id", "weight")) as Array<{
    id: string;
    weight: unknown;
  }>;
  const weights = new Map<string, number>();
  for (const row of rows) {
    const weight = Number(row.weight);
    if (row.weight !== null && Number.isFinite(weight) && weight > 0) weights.set(row.id, weight);
  }
  if (!weights.size) return order;
  return {
    ...order,
    items: ((order.items ?? []) as Line[]).map((line) => {
      const id = line && !hasOwnWeight(line) ? productIdOf(line) : null;
      const weight = id ? weights.get(id) : undefined;
      if (weight === undefined) return line;
      return {
        ...line,
        variant: { ...(line.variant ?? {}), product: { ...(line.variant?.product ?? {}), id, weight } },
      };
    }),
  };
};
