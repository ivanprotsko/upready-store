/**
 * Import provenance never reaches the browser (b08-seo-storefront).
 *
 * `apps/backend/scripts/cherkashina-migration/import.mjs` stamps every product,
 * variant and category it creates with `migrated_from`, `source_handle`,
 * `source_url`, `source_sku` and `source_variant_id`. The storefront asks for
 * `+metadata` because product SEO overrides and category images live there
 * (`util/tenant-seo.ts`, `util/category-image.ts`), and React serialises every
 * field of the object it was handed into the RSC payload inside the HTML. So the
 * PREVIOUS shop's domain shipped to every visitor and every crawler: measured on
 * the b08 stand, `olavka.ru` stood 52 times in one product page, 48 times in the
 * catalogue and 37 times on the home page.
 *
 * The cut is ONE place, `lib/config.ts`, where both Store API readers already
 * pass — not each loader that happens to carry a product today. Hardening one
 * call site is not fixing the class: the first pass here cleaned the product
 * loader and left `olavka.ru` on the home page anyway, because the category
 * query asks for `*products` and gets them whole, and then again on the
 * collection page, which asks the same thing (rule 20).
 *
 * The cut is NOT in the database: the redirect table is DERIVED from exactly
 * these fields (`apps/backend/src/tenant-redirects/migrated-redirects.ts` reads
 * `metadata.source_url` on every boot), and a migration that cannot say where a
 * row came from can never be re-run or audited. The provenance stays where it
 * belongs and stops one hop short of the markup.
 *
 * `source_id` is deliberately NOT in the list: the importer never writes it on
 * an entity, and other features use that name for their own ids.
 */
export const MIGRATION_METADATA_KEYS = [
  "migrated_from",
  "source_handle",
  "source_url",
  "source_sku",
  "source_variant_id",
] as const

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A copy of one entity's `metadata` with the import's provenance removed, or the value as it was. */
export function stripMigrationMetadata<T>(value: T): T {
  if (!isPlainObject(value)) {
    return value
  }

  const metadata = value.metadata

  if (!isPlainObject(metadata)) {
    return value
  }

  const present = MIGRATION_METADATA_KEYS.filter((key) => key in metadata)

  if (present.length === 0) {
    return value
  }

  const clean: Record<string, unknown> = { ...metadata }
  for (const key of present) {
    delete clean[key]
  }

  return { ...value, metadata: clean } as T
}

/**
 * The same cut over a whole Store API response: a product's `variants`, a
 * category's `products`, a collection's `products`, a cart's `items.product`
 * and anything else a `fields` list nests are serialised into the payload
 * exactly like the object holding them, so the walk goes all the way down.
 *
 * Nothing is copied unless something was actually removed, so a response with
 * no provenance in it (every response of a shop that was never imported) is
 * returned as it came, by identity.
 */
export function redactMigrationMetadata<T>(value: T, depth = 0): T {
  // A Store API response is a handful of levels deep. The bound is a guard
  // against a cycle in a hand-built object, not a limit anyone should meet.
  if (depth > 12) {
    return value
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const cleaned = redactMigrationMetadata(item, depth + 1)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return (changed ? next : value) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const stripped = stripMigrationMetadata(value)
  let changed = stripped !== value
  const out: Record<string, unknown> = changed ? { ...stripped } : { ...value }

  for (const [key, child] of Object.entries(out)) {
    if (key === "metadata") continue
    const cleaned = redactMigrationMetadata(child, depth + 1)
    if (cleaned !== child) {
      out[key] = cleaned
      changed = true
    }
  }

  return (changed ? out : value) as T
}
