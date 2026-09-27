/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15, Ivan's remark 24): the state logic of
 * the «В КОРЗИНЕ − N +» button, kept free of React and of the cart requests so it can be
 * tested on its own. The component (`./index.tsx`) runs the request this returns.
 */

/** The cart line of one variant: its id and how many of it are in the cart. */
export type CartLine = { lineId: string; quantity: number }

/** Every line of the cart by variant id, as the product page gets it from the server. */
export type CartLinesByVariant = Record<string, CartLine>

/** What one press of «+» or «−» asks of the cart. */
export type CartStep =
  | { kind: "add"; quantity: 1 }
  | { kind: "update"; lineId: string; quantity: number }
  | { kind: "remove"; lineId: string }
  | { kind: "none" }

/** The cart's lines by variant id; a variant twice in the cart (never by this button) keeps its first line. */
export function linesByVariant(
  items: ReadonlyArray<{ id: string; variant_id?: string | null; quantity: number }> | null | undefined
): CartLinesByVariant {
  const lines: CartLinesByVariant = {}
  for (const item of items ?? []) {
    if (item.variant_id && !lines[item.variant_id]) {
      lines[item.variant_id] = { lineId: item.id, quantity: item.quantity }
    }
  }
  return lines
}

/**
 * How many of a variant the cart may hold: its stock when the stock is tracked and back
 * orders are off, else no limit — the same rule as `variantInStock`.
 */
export function maxQuantity(
  variant:
    | { manage_inventory?: boolean | null; allow_backorder?: boolean | null; inventory_quantity?: number | null }
    | undefined
): number {
  if (!variant || !variant.manage_inventory || variant.allow_backorder) {
    return Infinity
  }
  return Math.max(0, variant.inventory_quantity ?? 0)
}

/**
 * One press: `+1` or `−1` from the line as it is now (`null`: not in the cart).
 *   not in the cart, +1 → add one;
 *   N in the cart, +1  → N + 1, unless that is over the stock;
 *   N > 1, −1          → N − 1;
 *   1, −1              → the line goes, and the button is «В корзину» again.
 */
export function cartStep(line: CartLine | null, delta: 1 | -1, max = Infinity): CartStep {
  if (!line) {
    return delta > 0 && max >= 1 ? { kind: "add", quantity: 1 } : { kind: "none" }
  }
  const next = line.quantity + delta
  if (next <= 0) {
    return { kind: "remove", lineId: line.lineId }
  }
  if (next > max) {
    return { kind: "none" }
  }
  return { kind: "update", lineId: line.lineId, quantity: next }
}

/** The line as it will be once the step is done, for the optimistic state. */
export function applyStep(line: CartLine | null, step: CartStep): CartLine | null {
  switch (step.kind) {
    case "add":
      return { lineId: line?.lineId ?? "", quantity: (line?.quantity ?? 0) + 1 }
    case "update":
      return { lineId: step.lineId, quantity: step.quantity }
    case "remove":
      return null
    default:
      return line
  }
}
