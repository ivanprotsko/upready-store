import { Link } from "@i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { listTenantPages } from "@lib/data/tenant-pages"
import { promoText } from "@lib/profile"
import { getSiteName } from "@lib/data/cookies"

import PoweredBy from "@modules/layout/components/powered-by"

/**
 * F6 · "Инверсия с гигантским wordmark" — F3's link rows, wordmark and legal row, on the
 * fixed-dark inverted plane. `block-port-map.md` §7 f6 row; composer source
 * `composer/lib/blocks.js` `footerF6`, `composer/lib/blocks.css:203-209`.
 *
 * The inversion reuses `bg-ui-contrast-bg-base`/`text-ui-contrast-fg-primary` (and
 * `-secondary`/`-border-base` for the muted rows), the pair `promo-banner/index.tsx` and
 * `free-shipping-price-nudge/index.tsx` already paint a full surface with — a FIXED dark
 * surface with near-white text in both light and dark mode (`globals.css:230-236`),
 * which is exactly what a footer that inverts regardless of the visitor's own mode needs,
 * rather than a one-off `bg-ui-fg-base` flip that would itself vary by mode. The same
 * clamp-based shrink as F3, no client measurement.
 *
 * `defaultMode: "dark"` is FORBIDDEN with `footer: "f6"`
 * (`lib/theme/composition.ts` `FORBIDDEN[1]`: "Footer Inverted giant wordmark turns light
 * on a dark page — reads as detached, not a foundation.") — enforced by `isForbidden()`
 * in the panel, the settings proxy and the backend route, not by this component; F6 only
 * ever mounts when `defaultMode` is `"light"`.
 */
export default async function FooterF6() {
  const [t, locale, siteName] = await Promise.all([
    getTranslations("Footer"),
    getLocale(),
    getSiteName(),
  ])
  const productCategories = await listCategories()
  const topLevelCategories = productCategories.filter(
    (category) => !category.parent_category_id
  )
  const { collections } = await listCollections()
  // tenant-panel wave 2, piece 7: the shop owner's own published content
  // pages, in the same link row as the categories and collections.
  const tenantPages = await listTenantPages()
  const clauses = promoText(locale)?.split(" · ") ?? []

  return (
    <footer className="border-t border-ui-contrast-border-base w-full bg-ui-contrast-bg-base text-ui-contrast-fg-primary">
      <div className="content-container flex flex-col w-full pt-10 pb-6 lg:pt-14">
        <div className="flex flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-8">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {topLevelCategories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.handle}`}
                  className="txt-compact-medium text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary transition-colors"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/collections/${collection.handle}`}
                  className="txt-compact-medium text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary transition-colors"
                >
                  {collection.title}
                </Link>
              </li>
            ))}
            {tenantPages.map((page) => (
              <li key={page.key}>
                <Link
                  href={`/pages/${page.key}`}
                  className="txt-compact-medium text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary transition-colors"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
          {clauses.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui-contrast-fg-secondary">
              {clauses.map((clause) => (
                <li key={clause} className="txt-compact-medium">
                  {clause}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          href="/"
          aria-label={siteName}
          className="block w-full uppercase font-semibold leading-[0.95] tracking-tight text-ui-contrast-fg-primary hover:text-ui-contrast-fg-secondary transition-colors overflow-hidden whitespace-nowrap my-3"
          style={{ fontSize: "clamp(44px, 13vw, 190px)" }}
        >
          {siteName}
        </Link>

        <div className="flex w-full mt-2.5 pt-4 justify-between items-center border-t border-ui-contrast-border-base text-ui-contrast-fg-secondary">
          <span className="txt-medium">
            {t("copyright", {
              year: new Date().getFullYear(),
              siteName: siteName,
            })}
          </span>
          {/* `!text-ui-contrast-fg-secondary` overrides `PoweredBy`'s own baked-in
              `text-ui-fg-muted` (styles/themes.css `--muted-foreground`, e.g. #55616d in
              light mode) — correct on a page background, low-contrast on this fixed-dark
              inverted plane. `!` forces the override regardless of Tailwind's own utility
              order, the same technique `globals.css`'s `!bg-ui-bg-disabled` selector
              already relies on. The icons keep their own fixed #9ca3af
              (`powered-by/index.tsx` `ICON_COLOR`), already surface-agnostic. */}
          <PoweredBy className="hidden lg:flex !text-ui-contrast-fg-secondary" />
        </div>
      </div>
    </footer>
  )
}
