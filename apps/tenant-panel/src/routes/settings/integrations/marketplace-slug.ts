/**
 * The URL a shop owner reads against the id the registry uses
 * (p01-settings-integrations-restructure).
 *
 * Ivan's order of 2026-09-16 20:22 WITA names the addresses in full:
 * `settings/marketplaces/wildberries`, `settings/marketplaces/ozon`. The
 * backend adapters are registered as `wb` and `ozon`
 * (`modules/marketplace/registry.ts`), and «wb» is not a word the owner of a
 * shop types. ONE map, here, so the two spellings meet in a single place rather
 * than in every route file (rule 20).
 *
 * A marketplace registered in the backend but missing from this map still shows
 * up on the hub and on `/settings/marketplaces` — it simply has no page of its
 * own until somebody gives it a readable URL, which is a decision about words,
 * not about code.
 */
export const MARKETPLACE_ID_BY_SLUG = {
  wildberries: "wb",
  ozon: "ozon",
} as const

export type MarketplaceSlug = keyof typeof MARKETPLACE_ID_BY_SLUG

/** The readable slug of a registry id, or `null` when it has none. */
export const slugForMarketplaceId = (id: string): MarketplaceSlug | null => {
  const found = (Object.keys(MARKETPLACE_ID_BY_SLUG) as MarketplaceSlug[]).find(
    (slug) => MARKETPLACE_ID_BY_SLUG[slug] === id
  )
  return found ?? null
}
