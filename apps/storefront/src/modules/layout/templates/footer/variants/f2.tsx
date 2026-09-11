import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { listTenantPages } from "@lib/data/tenant-pages"
import { SITE_NAME } from "@lib/util/env"

import PoweredBy from "@modules/layout/components/powered-by"

/**
 * F2 · "Одна строка" — everything the footer holds (wordmark, categories, collections)
 * flattened onto one wrapping row on a muted plane, legal row below.
 * `block-port-map.md` §7 f2 row; composer source `composer/lib/blocks.js` `footerF2`,
 * `composer/lib/blocks.css:121-124`. Same category/collection reads as `f1.tsx`, no new
 * data dependency.
 */
export default async function FooterF2() {
  const t = await getTranslations("Footer")
  const productCategories = await listCategories()
  const topLevelCategories = productCategories.filter(
    (category) => !category.parent_category_id
  )
  const { collections } = await listCollections()
  // tenant-panel wave 2, piece 7: the shop owner's own published content
  // pages, in the same link row as the categories and collections.
  const tenantPages = await listTenantPages()

  return (
    <footer className="border-t border-ui-border-base w-full bg-ui-bg-subtle">
      <div className="content-container flex flex-col w-full py-6">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <Link
            href="/"
            className="txt-compact-medium-plus text-ui-fg-subtle hover:text-ui-fg-base uppercase transition-colors"
          >
            {SITE_NAME}
          </Link>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

        <div className="flex w-full mt-4 pt-4 justify-between items-center border-t border-ui-border-base text-ui-fg-muted">
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
