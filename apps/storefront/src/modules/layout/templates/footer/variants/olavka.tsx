import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import { getSiteAttribution } from "@lib/data/attribution"
import { listCategories } from "@lib/data/categories"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { listTenantPages } from "@lib/data/tenant-pages"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { getTenantSeller } from "@lib/data/tenant-seller"
import { footerRequisitesLine, footerRequisitesText } from "@lib/util/footer-requisites"
import { footerLegalLinks, pagesBesideLegalLinks } from "@lib/util/legal-links"
import HydrationSlot from "@modules/common/components/hydration-slot"
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
 * So the skip switches on above 960, the width where `PRODUCT_GRID_CLASS` turns four
 * columns on these shops, and the two have to move together (`olavka.test.ts` holds them).
 *
 * No requisites block (batch 7, Ivan 03.10: «никаких ссылок на ИП Черкашина и т.д. Быть
 * не должно»): the legal name, the tax and registration numbers and the legal address
 * are not printed on these shops. The phone and the e-mail stay (`FooterContacts`).
 *
 * 08.10.2026 (t-2026-10-08-13): the requisites are back as one quiet line under the
 * columns, behind the switch `STOREFRONT_FOOTER_REQUISITES`, off by default. Robokassa
 * moderates a shop only when «Реквизиты продавца … размещены в подвале сайта», so the
 * Russian deployment turns the line on. Without the switch the footer prints no requisites,
 * as Ivan ordered on 03.10 (`@lib/util/footer-requisites`).
 *
 * The Robokassa mark stands in the same row under the columns, for a shop that connected
 * Robokassa and for no other (`getSitePaymentMethods`, a header read). The Robokassa
 * contract, clause 4.3.4, asks for the system's mark, a link to its site and the payment
 * terms where the buyer sees them before paying.
 *
 * 09.10.2026 (t-2026-10-09-76, Ivan: «Раз логотипы нужно размещать тогда уже стоит и
 * логотипа други систем»): the marks of what the shop takes through Robokassa stand beside
 * its logo, the bank cards of Мир, Visa and Mastercard and СБП. The sentence «Оплата картой и
 * через СБП. Платежи принимает Robokassa» is gone: no source asks for it, the marks say the
 * same, and the payment terms of clause 4.3.4 stand right above the pay button
 * (`RobokassaTermsLinks`). The requisites line reads in capitals, smaller than the links,
 * with commas and a colon after each abbreviation, as Ivan asked. The name stays in full:
 * Robokassa asks for «ИП ФИО (полностью)», and the Rules of sale of 30.05.2026 № 657, point
 * 22, want the name and the ОГРН on the site.
 */
const SKIP_FIRST_COLUMN = "min-[961px]:[&>*:nth-child(3n+1)]:col-start-2"
// The row under the columns takes the whole width and starts where the columns start, so
// it carries the same prefix as the skip above (`olavka.test.ts` holds the three together).
const UNDER_COLUMNS = "col-span-full min-[961px]:col-start-2"
// 12 px against the 14 px of `LINK`; subtle rather than muted, so the smaller capitals keep
// their contrast.
const REQUISITES = "txt-compact-xsmall text-ui-fg-subtle uppercase tracking-wide text-pretty"
const ROBOKASSA_URL = "https://robokassa.com/"
// Robokassa's own logo, the file its site gives out, 161 by 24, dark ink.
const ROBOKASSA_LOGO = "/payment/robokassa.svg"
/**
 * One plate for every mark, as in Ivan's footer frame (Figma 3:60801: 32 high, radius 8, a
 * light fill with a hairline border). It stays white in every theme and mode, because the
 * marks keep their owners' colours (`--payment-mark-plate`, globals.css).
 */
const MARK_PLATE =
  "inline-flex h-8 items-center rounded-lg border border-ui-border-base bg-[var(--payment-mark-plate)] px-3"
// Every mark is drawn 20 high in its own ratio: one size for all, and above the 18 px the
// СБП guide sets as the least height of its logo without the descriptor.
const MARK_IMAGE = "h-5 w-auto"
/**
 * The marks beside the Robokassa logo, in the order the checkout lists the methods: the
 * bank card (Мир, Visa, Mastercard), then СБП. Robokassa takes these cards of Russian banks
 * («банковские карты российских банков, выпущенные в рамках национальной платежной системы
 * «Мир», а также международных систем Visa, Mastercard», robokassa.com), and the checkout
 * offers only the card and СБП (`ROBOKASSA_VERIFIED_ALIASES`). Each file is its owner's
 * own, in full colour; where each one came from is in the task's report. `width` and
 * `height` give the ratio at 24 high. The names are the marks' own, which no locale
 * translates, so they are not catalog strings, as «Robokassa» is not.
 */
const PAYMENT_MARKS = [
  { name: "mir", alt: "Мир", width: 86, height: 24 },
  { name: "visa", alt: "Visa", width: 74, height: 24 },
  { name: "mastercard", alt: "Mastercard", width: 39, height: 24 },
  { name: "sbp", alt: "СБП", width: 44, height: 24 },
] as const

export default async function FooterOlavka() {
  const [t, tMeta, siteName, seller, categories, tenantPages, legal, attribution, paymentMethods] =
    await Promise.all([
      getTranslations("Footer"),
      getTranslations("Metadata"),
      getSiteName(),
      getTenantSeller(),
      listCategories(),
      listTenantPages(),
      getLegalLinkContext(),
      getSiteAttribution(),
      getSitePaymentMethods(),
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
  // Empty while the switch is off, and for a seller with no requisites filled in.
  const requisites = footerRequisitesLine(seller, {
    taxId: (value) => t("taxId", { value }),
    regNumber: (value) => t("regNumber", { value }),
    regNumberSoleTrader: (value) => t("regNumberSoleTrader", { value }),
  })
  const showRobokassa = paymentMethods.robokassa

  return (
    // No horizontal line anywhere (Ivan's remark 13 addition), and no legal row under it
    // (remark 19): the offer and the privacy policy are in the «©» column.
    <footer className="w-full bg-ui-bg-base" data-testid="footer-olavka">
      <div className="content-container py-10 lg:py-16">
        {/* The row under the columns comes late in the footer's payload, where Flight may
            hand it over as a lazy reference. The slot is this `<div>`'s first and only
            child, so that lazy is never the `<div>`'s own child (HydrationSlot). */}
        <HydrationSlot>
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

          {(showRobokassa || requisites.length > 0) && (
            <div className={`${PRODUCT_GRID_CLASS} mt-10`} data-testid="footer-olavka-under-columns">
              <div className={`${UNDER_COLUMNS} flex min-w-0 flex-col gap-y-3`}>
                {showRobokassa && (
                  <ul className="flex flex-wrap items-center gap-2.5" data-testid="footer-payment-marks">
                    <li className={MARK_PLATE} data-testid="footer-payment-plate">
                      <a
                        href={ROBOKASSA_URL}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center transition-opacity hover:opacity-80"
                        data-testid="footer-robokassa-link"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG from `public`, drawn as it is; next/image has no SVG config here. */}
                        <img src={ROBOKASSA_LOGO} alt="Robokassa" width={161} height={24} className={MARK_IMAGE} />
                      </a>
                    </li>
                    {PAYMENT_MARKS.map((mark) => (
                      <li key={mark.name} className={MARK_PLATE} data-testid="footer-payment-plate">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG from `public`, drawn as it is; next/image has no SVG config here. */}
                        <img
                          src={`/payment/${mark.name}.svg`}
                          alt={mark.alt}
                          width={mark.width}
                          height={mark.height}
                          className={MARK_IMAGE}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {requisites.length > 0 && (
                  <p className={REQUISITES} data-testid="footer-requisites-line">
                    {footerRequisitesText(requisites)}
                  </p>
                )}
              </div>
            </div>
          )}
        </HydrationSlot>
      </div>
    </footer>
  )
}
