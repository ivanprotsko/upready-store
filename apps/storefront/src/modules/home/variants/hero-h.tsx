import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { shopPromoText, shopTagline } from "@lib/data/shop-copy"
import { convertToLocale } from "@lib/util/money"
import { getProductPrice } from "@lib/util/get-product-price"
import { getHomeRegion, getLeadCollection, listLeadProducts } from "@lib/data/home"
import type { HomeHeroProps } from "@modules/home/variants/types"

/**
 * Hero H · Shelf (`composer/lib/hero.js` `key === "h"`, `hero.css` `.hero.h`). Three
 * product photographs standing on one ground, a flat copy panel beside them — the
 * "Ritual structure" comment in the source. Server-renderable: the CTA is a plain link to
 * the lead collection, no cart mutation (block-port-map.md §4, H row).
 *
 * Renders nothing when the profile has no lead collection or fewer than one priced
 * product with an image in it.
 *
 * Tenant panel wave 2, piece 8: the headline, the line under it and the button take the
 * tenant's home-page document (`content.hero`) when it fills them in. The shelf itself is
 * three photographs of three real products, so `imageUrl` has nothing to replace here and
 * is ignored — the document's image reaches the heroes that show ONE photograph
 * (Showcase and the profile hero's own photo layouts).
 */
export default async function HeroH({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: HomeHeroProps = {}) {
  const [t, locale, region] = await Promise.all([
    getTranslations("HomeHero"),
    getLocale(),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  const collection = await getLeadCollection()
  if (!collection) {
    return null
  }

  const shelf = await listLeadProducts({ collectionId: collection.id, region, limit: 3 })
  if (!shelf.length) {
    return null
  }

  const badge = (await shopPromoText(locale))?.split(" · ")[0] ?? null
  const headline = title || collection.title
  const line = subtitle || (await shopTagline())

  const shelfPrices = shelf
    .map((p) => getProductPrice({ product: p, locale }).cheapestPrice)
    .filter((price): price is NonNullable<typeof price> => !!price)
  const fromPrice = shelfPrices.length
    ? convertToLocale({
        amount: Math.min(...shelfPrices.map((p) => p.calculated_price_number)),
        currency_code: shelfPrices[0].currency_code,
        locale,
      })
    : null

  return (
    <section
      data-testid="home-hero-h"
      className="grid w-full grid-cols-1 border-b border-ui-border-base bg-ui-bg-subtle small:min-h-[520px] small:grid-cols-[1.15fr_.85fr]"
    >
      <div className="flex items-end justify-center gap-3 px-4 pb-6 pt-8 small:gap-6 small:px-10 small:pb-14">
        {shelf.map((p, i) => (
          <div
            key={p.id}
            className={
              "relative w-1/3 overflow-hidden rounded-[var(--radius,8px)] bg-ui-bg-base " +
              (i === 1 ? "h-[180px] w-[38%] small:h-[400px]" : "h-[150px] small:h-[340px]")
            }
          >
            {p.thumbnail ? (
              <Image
                src={p.thumbnail}
                alt=""
                fill
                quality={70}
                sizes="(max-width: 1024px) 33vw, 20vw"
                className="object-cover object-center"
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-col justify-center gap-4 bg-ui-bg-base px-6 py-8 small:px-12 small:py-0">
        {badge ? (
          <span className="w-fit rounded-full bg-ui-button-inverted px-3.5 py-1.5 text-xs font-semibold text-ui-contrast-fg-primary">
            {badge}
          </span>
        ) : null}
        <h2 className="text-balance text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-ui-fg-base small:text-[36px]">
          {headline}
        </h2>
        {line ? (
          <p className="max-w-[38ch] text-balance text-sm leading-relaxed text-ui-fg-subtle">
            {line}
          </p>
        ) : null}
        {fromPrice ? (
          <span className="tabular-nums text-lg font-semibold text-ui-fg-base">
            {t("h.from", { price: fromPrice })}
          </span>
        ) : null}
        <Link
          href={ctaHref || `/collections/${collection.handle}`}
          className="mt-1 inline-flex h-11 w-fit items-center justify-center rounded-full bg-ui-button-inverted px-6 text-sm font-medium text-ui-contrast-fg-primary transition-colors hover:opacity-90"
        >
          {ctaLabel || t("h.shop", { collection: collection.title?.toLowerCase() ?? "" })}
        </Link>
      </div>
    </section>
  )
}
