import { Link } from "@i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { listTenantPages } from "@lib/data/tenant-pages"
import { promoText } from "@lib/profile"
import { SITE_NAME } from "@lib/util/env"

import PoweredBy from "@modules/layout/components/powered-by"

/**
 * F5 · "Условия плитками" — up to 3 fact cards built from the profile's promo clauses,
 * then brand/categories/collections columns, legal row below.
 * `block-port-map.md` §7 f5 row; composer source `composer/lib/blocks.js` `footerF5`,
 * `composer/lib/blocks.css:137-142,147`.
 *
 * `promoText()` returns one string, `" · "`-joined
 * (`@lib/profile/index.ts`, mirrors the composer's own `clauses(p) = p.promo.split(" ·
 * ")`, `composer/lib/blocks.js:13`). All five profiles carry 3 clauses
 * (`block-port-map.md` §7 f5 asset-gap note), so `.slice(0, 3)` is the same graceful
 * degradation the composer applies rather than a hidden assumption; a profile with fewer
 * clauses, or a locale with no promo strip at all, renders fewer cards or none, never a
 * broken grid.
 */
export default async function FooterF5() {
  const t = await getTranslations("Footer")
  const locale = await getLocale()
  const productCategories = await listCategories()
  const topLevelCategories = productCategories.filter(
    (category) => !category.parent_category_id
  )
  const { collections } = await listCollections()
  // tenant-panel wave 2, piece 7: the shop owner's own published content pages
  // get their own Information column here — F5's brand block has only the two
  // catalog columns, so there is no existing column to append them to.
  const tenantPages = await listTenantPages()
  const facts = (promoText(locale)?.split(" · ") ?? []).slice(0, 3)

  return (
    <footer className="border-t border-ui-border-base w-full bg-ui-bg-base">
      <div className="content-container flex flex-col w-full py-10 lg:py-20">
        {facts.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-10">
            {facts.map((fact, index) => (
              <li
                key={fact}
                className="border border-ui-border-base rounded-lg bg-ui-bg-subtle px-4 py-4"
              >
                <span className="block txt-compact-2xsmall-plus font-mono tabular-nums text-ui-fg-muted tracking-wide">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 txt-medium-plus text-ui-fg-base leading-snug">
                  {fact}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-y-8 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href="/"
            className="txt-compact-medium-plus text-ui-fg-subtle hover:text-ui-fg-base uppercase transition-colors"
          >
            {SITE_NAME}
          </Link>
          <div
            className={
              tenantPages.length > 0
                ? "grid grid-cols-1 gap-y-8 sm:grid-cols-3 gap-x-10 md:gap-x-16"
                : "grid grid-cols-1 gap-y-8 sm:grid-cols-2 gap-x-10 md:gap-x-16"
            }
          >
            {topLevelCategories?.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="txt-medium-plus text-ui-fg-base font-medium">
                  {t("categoriesHeading")}
                </span>
                <ul className="flex flex-col gap-y-2">
                  {topLevelCategories.map((category) => (
                    <li key={category.id}>
                      <Link
                        href={`/categories/${category.handle}`}
                        className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {collections?.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="txt-medium-plus text-ui-fg-base font-medium">
                  {t("collectionsHeading")}
                </span>
                <ul className="flex flex-col gap-y-2">
                  {collections.map((collection) => (
                    <li key={collection.id}>
                      <Link
                        href={`/collections/${collection.handle}`}
                        className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                      >
                        {collection.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tenantPages.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="txt-medium-plus text-ui-fg-base font-medium">
                  {t("infoHeading")}
                </span>
                <ul className="flex flex-col gap-y-2">
                  {tenantPages.map((page) => (
                    <li key={page.key}>
                      <Link
                        href={`/pages/${page.key}`}
                        className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-ui-border-base w-full">
        <div className="content-container flex w-full mb-6 justify-between items-center pt-4 text-ui-fg-muted">
          <span className="txt-medium">
            {t("copyright", {
              year: new Date().getFullYear(),
              siteName: SITE_NAME,
            })}
          </span>
          <PoweredBy className="hidden lg:flex" />
        </div>
      </div>
    </footer>
  )
}
