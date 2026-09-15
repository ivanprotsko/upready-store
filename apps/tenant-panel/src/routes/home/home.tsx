import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowUpRightMini } from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"

import { SingleColumnPage } from "../../components/layout/pages"
import { useMe } from "../../hooks/api/users"
import { useDomains } from "../../hooks/api/domains"
import { useTenantLocaleSettings } from "../../hooks/api/locale-settings"
import { OverviewStats } from "./overview-stats"
import { SalesSummary } from "./sales-summary"
import { DeveloperDetails } from "./developer-details"

// tenant-panel: the panel's own Overview page (piece-1 prompt, item 6). Not a
// copy of the Admin's routes/home/home.tsx, which renders a widget-injected
// dashboard shell with no content of its own.
//
// f15-overview-empty (q02-qa-owner): the first screen used to open on the
// tenant's technical handle, "Канал продаж" and a publishable key — words a
// shop owner does not recognize, with a key that invites pasting it
// somewhere. It answers "what is happening in my shop" instead: product and
// order counts (OverviewStats), the existing sales summary, and a link to the
// storefront itself. The technical fields move into DeveloperDetails,
// collapsed by default.
export const Home = () => {
  const { t } = useTranslation()
  const { user, isPending, isError, error } = useMe()
  const {
    primary_host: primaryHost,
    isPending: isDomainsPending,
    isError: isDomainsError,
    error: domainsError,
  } = useDomains()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()

  if (isError) {
    throw error
  }
  if (isDomainsError) {
    throw domainsError
  }

  const tenant = user?.tenant
  const defaultLocale = localeSettings?.default_locale ?? "ru"
  const shopUrl = primaryHost ? `https://${primaryHost}/${defaultLocale}` : null

  return (
    <SingleColumnPage
      widgets={{ before: [], after: [] }}
      data={tenant}
      hasOutlet={false}
    >
      <Container className="flex flex-col gap-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Heading level="h1">
            {isPending ? t("general.loading") : tenant?.name}
          </Heading>
          {shopUrl ? (
            <Button asChild variant="secondary" size="small">
              <a
                href={shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-storefront-link"
              >
                {t("overview.openStorefront")}
                <ArrowUpRightMini />
              </a>
            </Button>
          ) : isDomainsPending ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("overview.loading")}
            </Text>
          ) : null}
        </div>

        <OverviewStats />

        <SalesSummary />

        <div className="flex flex-wrap items-center gap-x-4 border-t pt-6">
          <Link
            to="/products"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("products.domain")}
          </Link>
          <Link
            to="/orders"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("orders.domain")}
          </Link>
          {/* The shop's address (t-2026-09-12-tenant-address-canonical). Its
              own key now: the screen went from "Domains" to the address a shop
              lives on, and it is read by shop owners, not by staff. */}
          <Link
            to="/settings/domains"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("tenantAddress.title")}
          </Link>
          {/* t06-locale-currency: the shop's own default language and its
              enabled subset of the storefront's 36 locales. */}
          <Link
            to="/settings/locale"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("localeSettings.title", { defaultValue: "Язык и валюта" })}
          </Link>
          <Link
            to="/settings/payments"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("paymentSettings.title")}
          </Link>
          <Link
            to="/settings/notifications"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("notificationSettings.title")}
          </Link>
          {/* t12-legal-requisites: значения, подставляемые вместо {{ТОКЕНОВ}}
              в оферте, политике конфиденциальности и контактах магазина. */}
          <Link
            to="/settings/requisites"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            Реквизиты продавца
          </Link>
          {/* b10-panel-gaps: старые адреса магазина и коды подтверждения в
              поисковиках — две половины одного переезда со старого сайта. */}
          <Link
            to="/settings/redirects"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("redirects.title")}
          </Link>
          <Link
            to="/settings/seo"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("seoVerification.title")}
          </Link>
          {/* t17-analytics step 1: the shop's own Yandex Metrica / GA4 ids. */}
          <Link
            to="/settings/analytics"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("analyticsSettings.title")}
          </Link>
          {/* w01-wb-readonly-client: the shop's Wildberries connection, read-only. */}
          <Link
            to="/settings/wildberries"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("wildberries.title")}
          </Link>
          {/* t16-owner-branding: logo, favicon, og image, primary colour, footer credit. */}
          <Link
            to="/settings/branding"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("brandingSettings.title", { defaultValue: "Бренд" })}
          </Link>
        </div>

        <DeveloperDetails tenant={tenant} />
      </Container>
    </SingleColumnPage>
  )
}
