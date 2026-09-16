import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useMarketplaces } from "../../../hooks/api/marketplaces"
import { MpCard } from "./components/mp-card"

/**
 * «Маркетплейсы» — one section for every marketplace of the shop
 * (w12-marketplace-core, spec 2.7). It replaces the Wildberries-only page,
 * which now redirects here.
 *
 * The list of cards comes from `GET /tenants/marketplaces`, which reads
 * `modules/marketplace/registry.ts`. A third marketplace appears on this
 * screen by being registered in the backend, with nothing added here — that is
 * the property the whole task exists to buy (rule 20).
 *
 * There is no import button, on purpose. The imports are scripts, and no
 * adapter here can send a marketplace anything but a registered read.
 *
 * Design system: @medusajs/ui, like every other screen of this panel, which is
 * a copy of Medusa Admin 2.19. The divergence from the Geist canon is the one
 * already recorded in w01's report — importing Geist into an Admin fork would
 * make this one screen unlike the twenty next to it — and it is repeated in
 * this task's report rather than left silent.
 */
export const MarketplacesSettings = () => {
  const { t } = useTranslation()
  const { marketplaces, isPending, isError, error } = useMarketplaces()

  if (isError) {
    throw error
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading>{t("marketplaces.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.subtitle")}
          </Text>
          {/* w16-mp-scheduler-ops: расписание и состояние загрузок живут на
              отдельном экране — там строка на (площадка, вид), а не карточка. */}
          <Link
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
            to="/settings/marketplaces/sync"
          >
            {t("marketplaceSync.title")}
          </Link>
        </div>
      </Container>

      {isPending || !marketplaces ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        </Container>
      ) : marketplaces.length === 0 ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            {/* Zero adapters is a backend error, never an empty screen (rule 20a). */}
            <Text className="text-ui-fg-error" size="small">
              {t("marketplaces.empty")}
            </Text>
          </div>
        </Container>
      ) : (
        marketplaces.map((card) => <MpCard key={card.id} card={card} />)
      )}
    </SingleColumnPage>
  )
}
