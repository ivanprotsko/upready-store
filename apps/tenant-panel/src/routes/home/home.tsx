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
        </div>
      </Container>
    </SingleColumnPage>
  )
}
