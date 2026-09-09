import Image from "next/image"
import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { profile, categoryTiles } from "@lib/profile"
import {
  getCategoryProductCounts,
  getHomeRegion,
  listCatalogProducts,
} from "@lib/data/home"

/** small:grid-cols-N, N = the door count (never more than 3, `categoryTiles.slice(0, 3)`
 *  below) — stays single-column below 1024px regardless, matching `hero.css`'s own
 *  `body[data-width="mobile"] .hero.j .doors { grid-template-columns: 1fr }`. A lookup
 *  keeps the class name literal in source for Tailwind's content scan. */
const DOOR_COLS: Record<number, string> = {
  1: "small:grid-cols-1",
  2: "small:grid-cols-2",
  3: "small:grid-cols-3",
}

/**
 * Hero J · Three doors (`composer/lib/hero.js` `key === "j"`, `hero.css` `.hero.j`). The
 * profile's first 3 category tiles at hero scale, each captioned with its own product
 * count. Server-renderable, no cart mutation.
 *
 * Flagged "explicitly rejected in every theme" (block-port-map.md §4, J row,
 * `2026-09-09-theme-compositions.md:165-166` — it duplicates the tile row and empties the
 * first screen of product) but still a selectable composition value, so it has to render
 * correctly when an operator picks it regardless.
 *
 * Renders nothing when the profile has fewer than 1 category tile.
 */
export default async function HeroJ() {
  const [t, region] = await Promise.all([
    getTranslations("HomeHero"),
    getHomeRegion(),
  ])

  const doors = categoryTiles.slice(0, 3)
  if (!doors.length || !region) {
    return null
  }

  const [counts, catalog] = await Promise.all([
    getCategoryProductCounts({
      handles: doors.map((d) => d.categoryHandle),
      region,
    }),
    listCatalogProducts({ region, limit: 1 }),
  ])

  return (
    <section data-testid="home-hero-j" className="w-full px-4 pb-10 pt-8 small:px-8 small:pt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 small:mb-6">
        <div>
          <span className="text-xs font-medium uppercase tracking-[0.04em] text-ui-fg-subtle">
            {profile.brand?.name}
          </span>
          <h2 className="mt-1 max-w-[24ch] text-balance text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-ui-fg-base small:text-[30px]">
            {profile.brand?.tagline}
          </h2>
        </div>
        <Link
          href="/store"
          className="flex items-center gap-1 text-sm font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
        >
          {t("j.allProducts", { count: catalog.count })}
        </Link>
      </div>
      <div className={`grid grid-cols-1 gap-4 ${DOOR_COLS[doors.length] ?? DOOR_COLS[3]}`}>
        {doors.map((door) => (
          <Link
            key={door.categoryHandle}
            href={`/categories/${door.categoryHandle}`}
            className="group block overflow-hidden rounded-lg border border-ui-border-base"
          >
            <div className="relative h-[220px] w-full overflow-hidden bg-ui-bg-subtle small:h-[380px]">
              {door.image ? (
                <Image
                  src={door.image}
                  alt=""
                  fill
                  quality={65}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 bg-ui-bg-base px-4 py-3.5">
              <span className="text-sm font-semibold text-ui-fg-base">{door.label}</span>
              <span className="tabular-nums text-xs text-ui-fg-subtle">
                {t("j.items", { count: counts[door.categoryHandle] ?? 0 })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
