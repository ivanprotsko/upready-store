import { Alert, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { useMarketplaceStatus, useMarketplaces } from "../../../../hooks/api/marketplaces"
import { MpKeyForm } from "../../marketplaces/components/mp-key-form"
import { MARKETPLACE_ID_BY_SLUG, type MarketplaceSlug } from "../marketplace-slug"
import { CrossLink } from "./cross-link"

/**
 * «Подключение → Wildberries | Ozon» — the KEY of one marketplace and nothing
 * else (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «переименуй "подключение площадок" в
 * "подключение" и оставь там только поля для ввода ключей». So the card's
 * status, rights, tables, categories and sync moved to
 * `/settings/marketplaces/<slug>` and this page carries the form the owner came
 * for, with a link to the screen that reports on the connection.
 *
 * ONE component for every marketplace, driven by the registry the way `MpCard`
 * is: the fields, their labels and which of them are secret come from the
 * adapter through `connection.fields`, so a third marketplace gets this page by
 * being registered in the backend and named in `MARKETPLACE_ID_BY_SLUG`.
 *
 * TWO QUERIES, for the reason `MpCard` has two (rule 19h). The LIST answers
 * from our own database and carries the field declarations, so the inputs
 * render at once; the STATUS asks the marketplace what the key may do, and
 * until it lands the form simply has no rights line rather than a false one.
 */
export const MpIntegrationPage = ({ slug }: { slug: MarketplaceSlug }) => {
  const { t } = useTranslation()
  const marketplaceId = MARKETPLACE_ID_BY_SLUG[slug]

  const { marketplaces, isPending: isListPending, isError, error } = useMarketplaces()
  const { card: detail } = useMarketplaceStatus(marketplaceId)

  if (isError) {
    throw error
  }

  const listCard = marketplaces?.find((entry) => entry.id === marketplaceId) ?? null
  const card = detail ?? listCard

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{card?.label ?? t("integrations.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("integrations.marketplace.subtitle")}
          </Text>
        </div>

        {card ? (
          <MpKeyForm card={card} />
        ) : isListPending ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        ) : (
          <div className="px-6 py-6">
            {/*
              The registry answered and this marketplace is not in it. That is a
              backend error, not an empty screen: the route exists because the
              slug is mapped, so a miss means the adapter was removed (rule 20a).
            */}
            <Alert variant="error">{t("integrations.marketplace.unknown", { slug })}</Alert>
          </div>
        )}

        <div className="px-6 py-4">
          <CrossLink
            to={`/settings/marketplaces/${slug}`}
            hint={t("integrations.crossLink.marketplaceHint")}
            label={card?.label ?? slug}
            testId={`mp-screen-link-${slug}`}
          />
        </div>
      </Container>
    </SingleColumnPage>
  )
}
