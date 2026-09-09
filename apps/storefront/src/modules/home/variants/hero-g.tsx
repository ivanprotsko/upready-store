import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import {
  getHomeRegion,
  getLeadCollection,
  listLeadProducts,
} from "@lib/data/home"
import AddToBagButton from "@modules/home/components/add-to-bag-button"

/**
 * Hero G · Showcase (`composer/lib/hero.js` `key === "g"`, `hero.css` `.hero.g`). A single
 * headliner product: copy pane (collection eyebrow, product title, subtitle, price,
 * Add to bag, "See all") on one half, its photograph on the other — the same
 * pane/photograph split `SplitHero` (`profile-hero/index.tsx`) already uses, so the
 * copy never sits over the image and needs no scrim.
 *
 * The first cart-mutating hero in this codebase (block-port-map.md §4, "high" risk row):
 * Add to bag is `AddToBagButton`, unchanged from the client island `home/components/
 * add-to-bag-button` already built for P5 — no new fetch, `lib/data/cart.ts`'s own
 * `addToCart` server action underneath.
 *
 * Renders nothing when the profile's catalog has no lead collection or no priced product
 * in it (a fresh/empty stand) rather than an empty band.
 */
export default async function HeroG() {
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

  const [product] = await listLeadProducts({
    collectionId: collection.id,
    region,
    limit: 1,
  })
  if (!product) {
    return null
  }

  const { cheapestPrice } = getProductPrice({ product, locale })

  return (
    <section
      data-testid="home-hero-g"
      className="grid w-full grid-cols-1 border-b border-ui-border-base small:min-h-[520px] small:grid-cols-2"
    >
      <div className="relative order-first aspect-[4/5] w-full overflow-hidden bg-ui-bg-subtle small:order-last small:aspect-auto small:h-full small:border-l small:border-ui-border-base">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt=""
            fill
            priority
            quality={70}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
          />
        ) : null}
      </div>
      <div className="order-last flex flex-col justify-center gap-4 px-6 py-10 small:order-first small:px-14 small:py-0">
        <span className="text-xs font-medium uppercase tracking-[0.04em] text-ui-fg-subtle">
          {collection.title}
        </span>
        <h2 className="text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ui-fg-base small:text-[42px]">
          {product.title}
        </h2>
        {product.subtitle ? (
          <p className="max-w-[40ch] text-balance text-sm leading-relaxed text-ui-fg-subtle small:text-base">
            {product.subtitle}
          </p>
        ) : null}
        {cheapestPrice ? (
          <span
            className="tabular-nums text-xl font-semibold text-ui-fg-base"
            data-testid="home-hero-g-price"
          >
            {cheapestPrice.calculated_price}
          </span>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-6">
          <AddToBagButton product={product} size="large" />
          <Link
            href={`/collections/${collection.handle}`}
            className="flex items-center gap-1 text-sm font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            {t("g.seeAll", { collection: collection.title ?? "" })}
          </Link>
        </div>
      </div>
    </section>
  )
}
