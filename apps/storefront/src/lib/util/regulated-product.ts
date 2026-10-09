import type { HttpTypes } from "@medusajs/types"

/**
 * The owner's mark of a product for the law (t-2026-10-09-49, Ivan's ask 9c7d, item 7), set in
 * the shop panel (`apps/tenant-panel/src/lib/regulated-product.ts`) and kept in
 * `metadata.regulated_as`.
 *
 * - `supplement`, a dietary supplement (БАД): the product page prints «Не является лекарственным
 *   средством» under the description. 38-ФЗ «О рекламе», art. 25, part 1.1, asks every
 *   advertisement of a supplement for that warning.
 * - `medicine`, a medicinal product: the page prints nothing. 61-ФЗ, art. 55, part 1.1, lets only
 *   a pharmacy with a licence and a Roszdravnadzor permit sell medicines at a distance, so there
 *   is no line the law gives a shop for it, and the panel tells the owner so.
 *
 * Only the owner's explicit mark counts, never a guess from the category name, so a shop that
 * marked nothing renders as before. Sources: `~/upready/research/raw/2026-10-09-supplement-marking/`.
 */
export const REGULATED_AS_KEY = "regulated_as"

export type RegulatedAs = "supplement" | "medicine"

const VALUES: readonly unknown[] = ["supplement", "medicine"]

/** The product's mark, or `null` for no mark and for a value this storefront does not know. */
export function readRegulatedAs(
  product: Pick<HttpTypes.StoreProduct, "metadata"> | null | undefined
): RegulatedAs | null {
  const value = product?.metadata?.[REGULATED_AS_KEY]
  return VALUES.includes(value) ? (value as RegulatedAs) : null
}

/** Whether the product page prints «Не является лекарственным средством». */
export function showsSupplementNotice(
  product: Pick<HttpTypes.StoreProduct, "metadata"> | null | undefined
): boolean {
  return readRegulatedAs(product) === "supplement"
}
