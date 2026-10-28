import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import { getSiteName, getTenantHandle } from "@lib/data/cookies"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { listTenantPages } from "@lib/data/tenant-pages"
import { getTenantSeller } from "@lib/data/tenant-seller"

import SiteAttribution from "@modules/layout/components/site-attribution"
import FooterCredit from "@modules/layout/components/footer-credit"

import { f7TenantConfig, type F7Column, type F7Icon } from "../f7-tenant-config"

/**
 * F7 · "Три колонки в рамке, значки оплаты" — Ivan's Figma mockup for the Cherkashino
 * product page (node 9-70418, `t-2026-09-22-01` block 6, unit C): one hairline-bordered
 * panel split by vertical rules into «О магазине» plus up to two shop columns, a row of
 * outlined delivery and payment pills under it, and a last line with the copyright at the
 * start and the seller's requisites at the end.
 *
 * Added rather than rewriting F4 (the key Cherkashino has saved) so every other tenant's
 * footer stays exactly as it is — the same reasoning `footer/variants/index.ts` gives for
 * F4 still falling back to F1.
 *
 * What the mockup draws and what this component can actually source:
 *
 * - «Черкашина Оксана» is the shop's own name (`seller.name`, the tenant's name), and it
 *   links to the owner's About page when one is published, so the same name is not printed
 *   twice — `about` is then dropped from the page list below. `TENANT_PAGE_KEYS` in
 *   `apps/backend/src/modules/tenant/models/tenant-page.ts` reserves that key for exactly
 *   that page.
 * - «Контакты», «Публичная оферта», «Возврат», «Приватность» are the owner's own published
 *   pages (`listTenantPages()`), under their own titles and in the owner's own order. A
 *   page the owner has not published is simply absent; nothing here invents one.
 * - The seller's phone and e-mail are appended only when no `contacts` page is published,
 *   so a shop that answers «как связаться» with a page does not answer it twice.
 * - «Отследить заказ» points at the customer's own order list. That screen is this
 *   storefront's only order-status surface: `(main)/order/[id]/confirmed` needs an order id
 *   the footer does not have, and there is no guest tracking form anywhere in
 *   `app/[locale]/(main)`. Signed out, the route renders the account login rather than a
 *   404, so the link is live at every moment, which is why it is here rather than omitted.
 * - «Настройки cookie» is OMITTED: this storefront has no cookie-consent control at all
 *   (no consent banner, no preferences dialog, nothing under `src/modules`), and a link to
 *   a screen that does not exist is worse than a missing line.
 * - No requisites line (batch 7, Ivan 03.10: «никаких ссылок на ИП Черкашина и т.д. Быть
 *   не должно»): the legal name, the registration and tax numbers are not printed. The
 *   mockup drew them at the end of the last line; that corner now holds the attribution
 *   and the credit only.
 *
 * Columns 2 and 3 have no tenant-data source today and come from
 * `../f7-tenant-config.ts`, keyed by the tenant handle — see that file for why, and for
 * what replaces it. The payment row is the shop's own (D12, t-2026-10-20-61): the methods
 * it has connected, as text, never a brand image or a method it does not take; delivery
 * carriers are no longer listed.
 *
 * Colours are theme tokens throughout (`bg-ui-bg-base`, `border-ui-border-base`,
 * `text-ui-fg-base/-subtle/-muted`), so the panel reads on the dark preset as well as the
 * light one. No `FORBIDDEN` pair is registered for F7 for that reason.
 */

const HEADING =
  "txt-compact-2xsmall-plus uppercase tracking-[0.08em] text-ui-fg-muted"
const ENTRY = "txt-medium text-ui-fg-base"
const ENTRY_LINK = `${ENTRY} transition-colors hover:text-ui-fg-subtle`

/**
 * Tailwind needs the class as a literal in the source, so the column count is a lookup
 * rather than a template string. One column keeps the panel full width instead of leaving
 * two thirds of it blank, which is what a tenant with no config entry gets.
 */
const PANEL_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
}

/**
 * Generic outline glyphs, drawn here rather than imported: no third-party brand asset
 * ships in `public/`, and a play button in a rounded frame and a paper plane are the
 * shapes the mockup draws. `aria-hidden` because the label next to each one already says
 * what the channel is.
 */
function F7LinkIcon({ icon }: { icon: F7Icon }) {
  if (icon === "youtube") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-ui-fg-muted"
      >
        <rect
          x="1.6"
          y="4.6"
          width="16.8"
          height="10.8"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M8.6 7.7v4.6l4-2.3-4-2.3Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-ui-fg-muted"
    >
      <path
        d="M17.9 3.1 2.5 8.9c-.6.2-.6 1 0 1.2l3.8 1.2 1.4 4.3c.2.5.8.6 1.1.2l2-2.1 3.8 2.8c.4.3 1 .1 1.1-.4l2.6-11.9c.1-.6-.4-1.1-1-.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M17.6 3.5 7.7 11.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** One shop column from the tenant config. An entry with no `href` is text, not a link. */
function F7ShopColumn({ column }: { column: F7Column }) {
  return (
    <div className="flex flex-col gap-y-5 px-6 py-8 lg:px-10">
      <span className={HEADING}>{column.heading}</span>
      <ul className="flex flex-col gap-y-5">
        {column.links.map((link) => (
          <li key={link.label} className="flex items-center gap-x-3">
            {link.icon ? <F7LinkIcon icon={link.icon} /> : null}
            {link.href ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener"
                className={ENTRY_LINK}
              >
                {link.label}
              </a>
            ) : (
              <span className={ENTRY}>{link.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function FooterF7() {
  const [t, tPay, tManual, siteName, handle, seller, paymentMethods] =
    await Promise.all([
      getTranslations("Footer"),
      getTranslations("PaymentMethods"),
      getTranslations("ManualPayment"),
      getSiteName(),
      getTenantHandle(),
      getTenantSeller(),
      getSitePaymentMethods(),
    ])
  // D12 (t-2026-10-20-61): only the ways this shop really takes money, as plain text taken
  // from its own payment settings. The demo card is a test, never listed.
  const paymentLabels = [
    paymentMethods.robokassa ? tPay("pp_robokassa_robokassa") : null,
    paymentMethods.tribute ? "Tribute" : null,
    paymentMethods.btcpay ||
    paymentMethods.bitcart ||
    paymentMethods.x402 ||
    paymentMethods.manualCrypto
      ? tManual("methodCrypto")
      : null,
    paymentMethods.manualManager ? tManual("methodOther") : null,
  ].filter((label): label is string => label !== null)
  const tenantPages = await listTenantPages()

  const aboutPage = tenantPages.find((page) => page.key === "about")
  const linkedPages = tenantPages.filter((page) => page.key !== "about")
  const hasContactsPage = tenantPages.some((page) => page.key === "contacts")
  // The shop's own name, never its legal name (batch 7).
  const shopName = seller?.name ?? siteName

  const config = f7TenantConfig(handle)
  const shopColumns = config.columns.filter(
    (column) => column.heading.trim().length > 0 && column.links.length > 0
  )
  const columnCount = Math.min(1 + shopColumns.length, 3)

  return (
    <footer className="w-full bg-ui-bg-base">
      <div className="content-container flex flex-col w-full pt-10 lg:pt-16">
        <div className="rounded-xl border border-ui-border-base overflow-hidden">
          <div
            className={`grid grid-cols-1 divide-y divide-ui-border-base lg:divide-y-0 lg:divide-x ${PANEL_COLUMNS[columnCount]}`}
          >
            <div className="flex flex-col gap-y-5 px-6 py-8 lg:px-10">
              <span className={HEADING}>{t("aboutHeading")}</span>
              <ul className="flex flex-col gap-y-5">
                <li>
                  <Link
                    href={aboutPage ? `/pages/${aboutPage.key}` : "/"}
                    className={ENTRY_LINK}
                  >
                    {shopName}
                  </Link>
                </li>
                {linkedPages.map((page) => (
                  <li key={page.key}>
                    <Link href={`/pages/${page.key}`} className={ENTRY_LINK}>
                      {page.title}
                    </Link>
                  </li>
                ))}
                {!hasContactsPage && seller?.phone ? (
                  <li>
                    <a
                      href={`tel:${seller.phone.replace(/[^\d+]/g, "")}`}
                      className={ENTRY_LINK}
                    >
                      {seller.phone}
                    </a>
                  </li>
                ) : null}
                {!hasContactsPage && seller?.email ? (
                  <li>
                    <a
                      href={`mailto:${seller.email}`}
                      className={`${ENTRY_LINK} break-all`}
                    >
                      {seller.email}
                    </a>
                  </li>
                ) : null}
                <li>
                  <Link href="/account/orders" className={ENTRY_LINK}>
                    {t("trackOrder")}
                  </Link>
                </li>
              </ul>
            </div>

            {shopColumns.map((column) => (
              <F7ShopColumn key={column.heading} column={column} />
            ))}
          </div>
        </div>

        {paymentLabels.length > 0 && (
          <ul
            aria-label={t("paymentsLabel")}
            className="flex flex-wrap items-center gap-2 mt-6"
            data-testid="footer-badges"
          >
            {paymentLabels.map((label) => (
              <li
                key={label}
                className="rounded-lg border border-ui-border-base px-3 py-1 txt-compact-small text-ui-fg-muted"
              >
                {label}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-y-3 mt-8 mb-6 sm:flex-row sm:items-center sm:justify-between lg:mt-10">
          <span className="txt-medium text-ui-fg-base">
            {t("copyright", {
              year: new Date().getFullYear(),
              siteName: siteName,
            })}
          </span>
          <div className="flex flex-col items-start gap-y-1 sm:items-end">
            <SiteAttribution />
            <FooterCredit />
          </div>
        </div>
      </div>
    </footer>
  )
}
