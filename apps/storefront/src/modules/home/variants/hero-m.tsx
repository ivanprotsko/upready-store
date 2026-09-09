import { getLocale, getTranslations } from "next-intl/server"

import { profile, promoText } from "@lib/profile"
import { listCollections } from "@lib/data/collections"

/**
 * Hero M · No hero (`composer/lib/hero.js` `key === "m"`, `hero.css` `.hero.m`). The
 * shop opens straight on goods: a two-line text strip (brand tagline, promo copy), then
 * the heading of the "new arrivals" collection if the profile has one. No photograph, no
 * CTA, no cart mutation.
 *
 * Never returns null: even a profile with no promo strip and no `new-arrivals` collection
 * still shows its own brand tagline and a generic "In the shop" heading, matching
 * `composer`'s own fallback (`hero.js`: `news?.title ?? "In the shop"`).
 */
export default async function HeroM() {
  const [t, locale] = await Promise.all([getTranslations("HomeHero"), getLocale()])
  const { collections } = await listCollections({ fields: "id,handle,title" })
  const featured =
    collections.find((c) => c.handle === "new-arrivals") ?? collections[0] ?? null

  return (
    <section data-testid="home-hero-m" className="w-full px-4 pb-1 pt-6 small:px-8 small:pt-8">
      <div className="flex flex-col gap-1.5 border-b border-ui-border-base pb-4 text-xs text-ui-fg-subtle small:flex-row small:items-center small:justify-between small:gap-5 small:pb-5">
        {profile.brand?.tagline ? <span>{profile.brand.tagline}</span> : null}
        {promoText(locale) ? <span>{promoText(locale)}</span> : null}
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mt-5 small:text-xl">
        {featured?.title ?? t("m.fallbackHeading")}
      </h2>
    </section>
  )
}
