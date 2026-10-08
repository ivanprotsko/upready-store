import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { listBrands } from "@lib/data/brands"
import BrandTiles from "@modules/brands/components/brand-tiles"
import { HOME_SECTION_CLASS } from "@modules/home/components/listing-section"

/** Two rows of six on a desktop, four rows of three on a phone. */
export const HOME_BRANDS_LIMIT = 12

/**
 * The brands block of the home page (ask a0e1), under the shop's own composed blocks. It
 * renders nothing for a shop with no `brands` category, so no other shop's home changes.
 */
export default async function HomeBrands() {
  const brands = await listBrands()

  if (!brands.length) {
    return null
  }

  const t = await getTranslations("Store")

  return (
    <section className={HOME_SECTION_CLASS} data-testid="home-brands">
      <div className="mb-4 flex items-baseline justify-between gap-x-4 small:mb-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:text-xl">{t("brands")}</h2>
        {brands.length > HOME_BRANDS_LIMIT ? (
          <Link
            href="/brands"
            className="shrink-0 text-sm text-ui-fg-interactive hover:underline hover:underline-offset-2"
            data-testid="home-brands-all"
          >
            {t("allBrands")}
          </Link>
        ) : null}
      </div>
      <BrandTiles brands={brands} limit={HOME_BRANDS_LIMIT} />
    </section>
  )
}
