/**
 * The owner's mark of a product for the law (t-2026-10-09-49, Ivan's ask 9c7d,
 * item 7): a dietary supplement (БАД), a medicinal product, or no mark. Medusa
 * has no such field, so it lives in `metadata.regulated_as`, and the storefront
 * reads the same key (`apps/storefront/src/lib/util/regulated-product.ts`).
 *
 * - `supplement`: the storefront prints «Не является лекарственным средством»
 *   under the description. 38-ФЗ «О рекламе», art. 25, part 1.1, asks every
 *   advertisement of a supplement for that warning.
 * - `medicine`: the storefront prints nothing. 61-ФЗ, art. 55, part 1.1, lets
 *   only a pharmacy with a pharmaceutical licence and a Roszdravnadzor permit
 *   sell medicines at a distance, and prescription medicines not at all, so
 *   the panel says that to the owner instead of inventing a line.
 *
 * Sources: `~/upready/research/raw/2026-10-09-supplement-marking/`.
 *
 * Plain TS, no JSX, so `__tests__/regulated-product.test.mjs` imports and runs
 * it for real.
 */
export const REGULATED_AS_KEY = "regulated_as"

export const REGULATED_AS_VALUES = ["supplement", "medicine"] as const
export type RegulatedAs = (typeof REGULATED_AS_VALUES)[number]

/** The select's value for a product without a mark. Never written to `metadata`. */
export const REGULATED_AS_NONE = "none"
export type RegulatedAsChoice = RegulatedAs | typeof REGULATED_AS_NONE

export const REGULATED_AS_CHOICES: readonly RegulatedAsChoice[] = [
  REGULATED_AS_NONE,
  ...REGULATED_AS_VALUES,
]

/** The product's mark, or `null` for no mark and for any value this panel does not know. */
export function readRegulatedAs(
  metadata: Record<string, unknown> | null | undefined
): RegulatedAs | null {
  const value = metadata?.[REGULATED_AS_KEY]
  return (REGULATED_AS_VALUES as readonly unknown[]).includes(value)
    ? (value as RegulatedAs)
    : null
}

/**
 * The product's `metadata` with the mark set, every other key left as it was.
 * «No mark» deletes the key rather than storing an empty value, so a product
 * that was never marked and one that was unmarked look the same.
 */
export function mergeRegulatedAs(
  metadata: Record<string, unknown> | null | undefined,
  choice: RegulatedAsChoice
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  if (choice === REGULATED_AS_NONE) {
    delete base[REGULATED_AS_KEY]
  } else {
    base[REGULATED_AS_KEY] = choice
  }
  return base
}
