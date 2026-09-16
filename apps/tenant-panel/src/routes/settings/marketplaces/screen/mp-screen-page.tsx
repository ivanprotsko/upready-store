import { Alert, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { useMarketplaceStatus, useMarketplaces } from "../../../../hooks/api/marketplaces"
import { CrossLink } from "../../integrations/components/cross-link"
import {
  MARKETPLACE_ID_BY_SLUG,
  type MarketplaceSlug,
} from "../../integrations/marketplace-slug"
import { MpCard } from "../components/mp-card"

/**
 * `/settings/marketplaces/wildberries` and `/settings/marketplaces/ozon` — the
 * SCREEN of one marketplace (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «страницы для ozon и WB сделай по таким адресам
 * settings/marketplaces/wildberries settings/marketplaces/ozon». Before this
 * the sidebar carried the shared hub plus a `#wb` anchor into the middle of
 * a shared page, which is exactly what the order forbids.
 *
 * The content is the marketplace card the hub used to stack: connection state,
 * what the key may do and until when, what is linked, what has been imported,
 * which reads are allowed. WITHOUT the key form — that moved to
 * `/settings/integrations/<слаг>`, and this page links there.
 *
 * ONE component for both marketplaces, driven by the registry: a third
 * marketplace gets its screen by being registered in the backend and named in
 * `MARKETPLACE_ID_BY_SLUG` (rule 20).
 */
export const MpScreenPage = ({ slug }: { slug: MarketplaceSlug }) => {
  const { t } = useTranslation()
  const marketplaceId = MARKETPLACE_ID_BY_SLUG[slug]

  const { marketplaces, isPending, isError, error } = useMarketplaces()
  const { card: detail } = useMarketplaceStatus(marketplaceId)

  if (isError) {
    throw error
  }

  const card = (marketplaces ?? []).find((entry) => entry.id === marketplaceId) ?? null

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading>{card?.label ?? detail?.label ?? slug}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.card.subtitle")}
          </Text>
          <div className="mt-2">
            <CrossLink
              to={`/settings/integrations/${slug}`}
              hint={t("integrations.crossLink.keyHint")}
              label={t("integrations.title")}
              testId={`mp-key-link-${slug}`}
            />
          </div>
        </div>
      </Container>

      {isPending && !card ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        </Container>
      ) : card ? (
        <MpCard card={card} showKeyForm={false} />
      ) : (
        <Container className="p-0">
          <div className="px-6 py-6">
            {/* The registry answered and this marketplace is not in it — a
                backend error, not an empty screen (rule 20a). */}
            <Alert variant="error">{t("integrations.marketplace.unknown", { slug })}</Alert>
          </div>
        </Container>
      )}
    </SingleColumnPage>
  )
}
