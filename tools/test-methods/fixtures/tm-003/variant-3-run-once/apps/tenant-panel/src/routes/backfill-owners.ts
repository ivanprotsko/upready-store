/**
 * Variant of the f12 class with the third marker: not wired into any pnpm
 * script — run once with `node backfill-owners.ts` against a scratch database
 * while the owner screens were being measured.
 */
export async function backfillOwners() {
  return { touched: 0 };
}
