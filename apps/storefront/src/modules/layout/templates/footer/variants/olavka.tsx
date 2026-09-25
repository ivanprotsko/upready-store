import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import { getSiteAttribution } from "@lib/data/attribution"
import { listCategories } from "@lib/data/categories"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { listTenantPages } from "@lib/data/tenant-pages"
import { getTenantSeller } from "@lib/data/tenant-seller"
import { footerLegalLinks } from "@lib/util/legal-links"
import { PRODUCT_GRID_CLASS } from "@modules/products/components/product-card"
import { FooterContacts, FooterRequisites } from "@modules/layout/components/footer-seller"

// BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15, Ivan's remark 13): the Olavka shop's
// footer, for the shops in `OLAVKA_SHOP_HANDLES` (`@lib/data/olavka-shop`). Every other shop
// keeps the footer its settings pick (F1 by default).

const HEADING = "txt-medium-plus text-ui-fg-base font-medium"
const LINK = "txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"

/**
 * Three columns — Категории, Информация, «© {shop}» with the offer, the privacy policy and
 * «Создание интернет-магазина» under it — on the product grid's own tracks
 * (`PRODUCT_GRID_CLASS` inside the same `content-container`), so each column's text starts
 * where a product column starts. No copyright line and no attribution line under the
 * columns: both now live in the «©» column.
 *
 * With four product columns the first one stays empty and the content takes columns 2–4
 * (Ivan's remark 15): every row starts at column 2 (`SKIP_FIRST_COLUMN`), so the seller's
 * requisites, when the shop has them, open the next row under Категории. With two or three
 * product columns the footer starts at column 1 as before: an empty column there would
 * squeeze the text or push «©» onto a second row.
 */
const SKIP_FIRST_COLUMN = "large:[&>*:nth-child(3n+1)]:col-start-2"

export default async function FooterOlavka() {
  const [t, tMeta, siteName, seller, categories, tenantPages, legal, attribution] =
    await Promise.all([
      getTranslations("Footer"),
      getTranslations("Metadata"),
      getSiteName(),
      getTenantSeller(),
      listCategories(),
      listTenantPages(),
      getLegalLinkContext(),
      getSiteAttribution(),
    ])
  const topLevelCategories = categories.filter((category) => !category.parent_category_id)
  const titles = Object.fromEntries(tenantPages.map((page) => [page.key, page.title]))
  const legalLinks = footerLegalLinks(legal, titles, {
    terms: tMeta("terms.title"),
    privacy: tMeta("privacy.title"),
  })
  // The attribution's own anchor (the shop's override, else ours), as a menu item.
  const creditLabel = attribution.anchor.charAt(0).toUpperCase() + attribution.anchor.slice(1)

  return (
    // No horizontal line anywhere (Ivan's remark 13 addition): no top border here, and the
    // legal row under it is rendered `bare` by the footer switch.
    <footer className="w-full bg-ui-bg-base" data-testid="footer-olavka">
      <div className="content-container py-10 lg:py-16">
        <div className={`${PRODUCT_GRID_CLASS} ${SKIP_FIRST_COLUMN}`}>
          {topLevelCategories.length > 0 && (
            <div className="flex min-w-0 flex-col gap-y-3">
              <span className={HEADING}>{t("categoriesHeading")}</span>
              <ul className="flex flex-col gap-y-2">
                {topLevelCategories.map((category) => (
                  <li key={category.id}>
                    <Link href={`/categories/${category.handle}`} className={LINK}>
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tenantPages.length > 0 && (
            <div className="flex min-w-0 flex-col gap-y-3">
              <span className={HEADING}>{t("infoHeading")}</span>
              <ul className="flex flex-col gap-y-2">
                {tenantPages.map((page) => (
                  <li key={page.key}>
                    <Link href={`/pages/${page.key}`} className={LINK}>
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-y-3" data-testid="footer-olavka-shop">
            <span className={HEADING}>{`© ${siteName}`}</span>
            <ul className="flex flex-col gap-y-2">
              {legalLinks.map((link) => (
                <li key={link.slot}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={attribution.href}
                  target="_blank"
                  rel={attribution.rel}
                  className={LINK}
                  data-testid="site-attribution"
                >
                  {creditLabel}
                </a>
              </li>
            </ul>
            <FooterContacts seller={seller} />
          </div>

          <FooterRequisites seller={seller} />
        </div>
      </div>
    </footer>
  )
}
