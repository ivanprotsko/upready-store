import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Container, Heading, Text } from "@medusajs/ui"

import { SingleColumnPage } from "../../components/layout/pages"
import { useMe } from "../../hooks/api/users"
import { PublishableKey } from "./publishable-key"

// tenant-panel: the panel's own Overview page (piece-1 prompt, item 6). Not a
// copy of the Admin's routes/home/home.tsx, which renders a widget-injected
// dashboard shell with no content of its own. This shows the tenant's own
// identity (name, handle, sales channel, publishable key) and links into the
// two screens the panel has.
export const Home = () => {
  const { t } = useTranslation()
  const { user, isPending, isError, error } = useMe()

  if (isError) {
    throw error
  }

  const tenant = user?.tenant

  return (
    <SingleColumnPage
      widgets={{ before: [], after: [] }}
      data={tenant}
      hasOutlet={false}
    >
      <Container className="flex flex-col gap-y-6 p-6">
        <div>
          <Heading level="h1">
            {isPending ? t("general.loading") : tenant?.name}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {tenant?.handle}
          </Text>
        </div>
        <div className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            {t("fields.salesChannel")}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {tenant?.sales_channel?.name ?? "-"}
          </Text>
        </div>
        <div className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            {t("apiKeyManagement.domain.publishable")}
          </Text>
          {tenant?.api_key ? (
            <PublishableKey
              redacted={tenant.api_key.redacted}
              token={tenant.api_key.token}
            />
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              -
            </Text>
          )}
        </div>
        <div className="flex items-center gap-x-4">
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
          {/* t16-owner-branding: logo, favicon, og image, primary colour, footer credit. */}
          <Link
            to="/settings/branding"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
          >
            {t("brandingSettings.title", { defaultValue: "Бренд" })}
          </Link>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
