import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import { getSiteAttribution } from "@lib/data/attribution"
import { listCategories } from "@lib/data/categories"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { listTenantPages } from "@lib/data/tenant-pages"
import { getTenantSeller } from "@lib/data/tenant-seller"
import { footerLegalLinks, pagesBesideLegalLinks } from "@lib/util/legal-links"
import { PRODUCT_GRID_CLASS } from "@modules/products/components/product-card"
import { FooterContacts } from "@modules/layout/components/footer-seller"

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
 * product columns the footer starts at column 1 (Ivan 04.10.2026: «когда три колонки, то
 * крайняя левая должна быть занята»): an empty column there pushes «©» onto a second row.
 * So the skip switches on at `large`, the breakpoint where `PRODUCT_GRID_CLASS` turns
 * four columns, and the two have to move together (`olavka.test.ts` holds them).
 *
 * No requisites block (batch 7, Ivan 03.10: «никаких ссылок на ИП Черкашина и т.д. Быть
 * не должно»): the legal name, the tax and registration numbers and the legal address
 * are not printed on these shops. The phone and the e-mail stay (`FooterContacts`).
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
  // The offer and the privacy policy stay in the «©» column, which links them from every
  // page whatever the shop lists (remark 19), so «Информация» leaves them out rather than
  // naming them a second time (t-2026-10-04-19, all three Черкашино sites).
  const infoPages = pagesBesideLegalLinks(tenantPages, legalLinks)
  // The attribution's own anchor (the shop's override, else ours), as a menu item; none
  // at all for a shop switched off with `attribution_hidden` (Ivan 04.10.2026).
  const creditLabel = attribution
    ? attribution.anchor.charAt(0).toUpperCase() + attribution.anchor.slice(1)
    : null

  return (
    // No horizontal line anywhere (Ivan's remark 13 addition), and no legal row under it
    // (remark 19): the offer and the privacy policy are in the «©» column.
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

          {infoPages.length > 0 && (
            <div className="flex min-w-0 flex-col gap-y-3">
              <span className={HEADING}>{t("infoHeading")}</span>
              <ul className="flex flex-col gap-y-2">
                {infoPages.map((page) => (
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
              {attribution && (
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
              )}
            </ul>
            <FooterContacts seller={seller} />
          </div>
        </div>
      </div>
    </footer>
  )
}
