/**
 * The per-locale override of a piece of shop content, the `i18n` convention the
 * home document's hero started (`content.hero.i18n`, read by `localizedHero`):
 * the content keeps its base text in the shop's own language and an optional
 * `i18n` object keyed by storefront locale (`ru`, `en`, `pt-BR`) overrides it.
 *
 * Returns the entry for `locale`, else for its language part (`pt-BR` → `pt`),
 * else `null`, in which case the caller shows the base text. The input crosses
 * the wire as JSON an owner or a script wrote, so anything that is not an
 * object keyed by locale reads as "no override" rather than being trusted.
 */
export function pickLocaleCopy(
  i18n: unknown,
  locale: string | null | undefined
): Record<string, unknown> | null {
  if (!isRecord(i18n) || !locale) {
    return null
  }

  const language = locale.split("-")[0]
  for (const candidate of [locale, language]) {
    const copy = Object.hasOwn(i18n, candidate) ? i18n[candidate] : undefined
    if (isRecord(copy)) {
      return copy
    }
  }

  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
