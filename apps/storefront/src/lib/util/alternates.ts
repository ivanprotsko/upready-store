import { locales, defaultLocale } from "@i18n/config"
import { getRequestBaseURL, getEnabledLocales, getTenantDefaultLocale } from "@lib/data/cookies"
import { getHreflangSisters } from "@lib/data/hreflang-sisters"
import { shopLocales } from "@lib/util/shop-locales"
import { buildAlternatesFor } from "@lib/util/alternates-core"

/**
 * The pure half lives in `alternates-core.ts` and is re-exported here: this
 * module reaches `next/headers` through `lib/data/cookies`, which is
 * `server-only`, so a unit test importing it fails at load (rule 19g — the
 * directive colours the whole import graph).
 */
export { buildAlternatesFor }

/**
 * `canonical` plus one `hreflang` per locale THIS SHOP publishes, on the origin
 * the request arrived on.
 *
 * One process serves every shop by Host, so the base is read per request
 * (`getRequestBaseURL`) rather than once per module: the constant that stood here put
 * `https://stores.shipshift.dev` into the <head> of every tenant storefront
 * (measured 2026-09-12 on five hosts). See `lib/tenant/origin.ts`.
 *
 * The language list is read per request for the same reason (b08-seo-storefront).
 * The build ships 36 locales, so every page of a two-language shop carried 37
 * `hreflang` links, 34 of them pointing at translations the owner never enabled
 * — the same defect the sitemap had, one <head> lower. A shop that has saved no
 * `enabled_locales` keeps all 36, exactly as before.
 *
 * `sisters` (t-cherk-31) are the other sites of this shop's own client
 * (`GET /store/tenant/sites`, `lib/data/hreflang-sisters.ts`): one `hreflang`
 * each, for a language this shop does not already publish itself. A shop with
 * no sisters gets an empty list and emits exactly what it did before.
 */
export async function buildAlternates(locale: string, path: string) {
  const [base, enabled, sisters, shopDefault] = await Promise.all([
    getRequestBaseURL(),
    getEnabledLocales(),
    getHreflangSisters(),
    getTenantDefaultLocale(),
  ])

  return buildAlternatesFor(
    base,
    locale,
    path,
    shopLocales(locales, enabled, defaultLocale),
    sisters,
    shopDefault
  )
}
