import type { CdekCreateOrderInput } from "./client";
import { unitWeightGrams } from "./method";

/**
 * The goods of a CDEK parcel (t-2026-10-09-57). CDEK refuses an online-shop
 * order whose package has no `items`: `400 v2_field_is_empty: [packages[0].items]
 * is empty`, measured by the store lead on the sandbox contour on 09.10.2026
 * (`/Users/ivanprotsko/upready/evidence/upready-store/t-2026-10-09-57/`).
 *
 * What Medusa 2.19 hands `createFulfillment` (core-flows
 * `order/workflows/create-fulfillment.js`): the fulfillment `items` carry
 * `line_item_id`, `quantity`, `sku` and a `title` that is the VARIANT's title,
 * with no price and no weight; a variant with managed inventory gets one item
 * per inventory item, its quantity multiplied by `required_quantity`. The
 * `order` carries every line (`items.*`, so `product_title`, `variant_title`,
 * `variant_sku`, `unit_price`) with `items.variant.weight` and the variant's
 * inventory items. So each parcel line is read off the order's line by
 * `line_item_id`, and the fulfillment item only says how many of it go.
 *
 * A unit weighs what the price weighed it at: the variant, then its product,
 * then the shop's default (`unitWeightGrams`). The product weight is not in the
 * order Medusa hands over; the provider adds it first (`product-weights.ts`).
 *
 * Amounts in Medusa 2 are in the currency's main unit, so `unit_price` is
 * already in roubles. The parcel weight is the sum of these lines, because CDEK
 * checks it against them.
 */
export type CdekPackageItem = NonNullable<CdekCreateOrderInput["packages"][number]["items"]>[number];

/** Grams for one unit whose variant has no weight, when the shop set none either. */
export const FALLBACK_UNIT_WEIGHT_G = 1000;

/**
 * Longest `ware_key` CDEK takes. Measured on the sandbox contour on 09.10.2026
 * (t-2026-10-09-57): 50 characters give a SUCCESSFUL order, 51 an INVALID one,
 * `error_validate_good_article_more_than_50`.
 */
export const WARE_KEY_MAX = 50;

/** Longest `name` sent: CDEK prints it on the waybill. */
export const ITEM_NAME_MAX = 255;

type Line = {
  id?: string;
  title?: string | null;
  product_title?: string | null;
  variant_title?: string | null;
  variant_sku?: string | null;
  variant_id?: string | null;
  unit_price?: unknown;
  variant?: {
    sku?: string | null;
    weight?: number | null;
    /** Not in Medusa's order: `withProductWeights` puts it here for a variant without a weight. */
    product?: { weight?: number | null } | null;
    inventory_items?: Array<{
      required_quantity?: number | null;
      inventory?: { id?: string | null } | null;
    }> | null;
  } | null;
};

type FulfilledItem = {
  line_item_id?: string | null;
  inventory_item_id?: string | null;
  quantity?: unknown;
  title?: string | null;
  sku?: string | null;
};

/** A Medusa amount as a plain number: a number, a numeric string or a BigNumber. */
export const amountOf = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object") {
    const { numeric, value: inner } = value as { numeric?: unknown; value?: unknown };
    if (typeof numeric === "number") return numeric;
    if (inner !== undefined) return amountOf(inner);
  }
  return 0;
};

const clean = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();

/** «Product, variant»; a variant called like the product or Medusa's «Default variant» adds nothing. */
const nameOf = (line: Line | undefined, item: FulfilledItem): string => {
  const product = clean(line?.product_title) || clean(line?.title) || clean(item.title);
  const variant = clean(line?.variant_title);
  const useless = !variant || variant.toLowerCase() === product.toLowerCase() || /^default( variant)?$/i.test(variant);
  const name = useless ? product : `${product}, ${variant}`;
  return (name || "Товар").slice(0, ITEM_NAME_MAX);
};

/**
 * One parcel line per order line. `defaultWeightG` is the shop's default for a
 * unit with no weight on its variant or product (the method's
 * `default_weight_g`, the same number the price was quoted with); without it
 * {@link FALLBACK_UNIT_WEIGHT_G}.
 */
export function packageItems(
  fulfilled: ReadonlyArray<Record<string, unknown>>,
  order: Record<string, unknown> | undefined,
  defaultWeightG?: number | null,
): { items: CdekPackageItem[]; weight: number } {
  const lines = new Map<string, Line>();
  for (const line of ((order?.items ?? []) as Line[])) {
    if (line?.id) lines.set(line.id, line);
  }
  const unitDefault =
    typeof defaultWeightG === "number" && defaultWeightG > 0 ? Math.round(defaultWeightG) : FALLBACK_UNIT_WEIGHT_G;

  // A variant with managed inventory comes as one fulfillment item per
  // inventory item: the first one of each line, divided back by its
  // `required_quantity`, is how many of the line go into this parcel.
  const seen = new Set<string>();
  const items: CdekPackageItem[] = [];
  for (const raw of fulfilled as FulfilledItem[]) {
    const key = raw.line_item_id ?? `${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = raw.line_item_id ? lines.get(raw.line_item_id) : undefined;
    const required =
      line?.variant?.inventory_items?.find((each) => each?.inventory?.id && each.inventory.id === raw.inventory_item_id)
        ?.required_quantity ?? 1;
    const amount = Math.max(1, Math.round(amountOf(raw.quantity) / (Number(required) > 0 ? Number(required) : 1)));
    const weight = Math.max(
      1,
      Math.round(
        unitWeightGrams({ weight: line?.variant?.weight, product_weight: line?.variant?.product?.weight }, unitDefault),
      ),
    );
    const wareKey =
      clean(line?.variant_sku) || clean(line?.variant?.sku) || clean(raw.sku) || clean(line?.variant_id) || key;
    items.push({
      name: nameOf(line, raw),
      ware_key: wareKey.slice(0, WARE_KEY_MAX),
      // Paid on the site: the shop takes no cash on delivery.
      payment: { value: 0 },
      cost: Math.max(0, Math.round(amountOf(line?.unit_price) * 100) / 100),
      weight,
      amount,
    });
  }
  const weight = items.reduce((sum, item) => sum + item.weight * item.amount, 0);
  return { items, weight: Math.max(1, weight) };
}
