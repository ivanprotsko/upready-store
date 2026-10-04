import { Key, ShoppingBag } from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"

/**
 * «Ozon» (mp-section-design): a stub, as Ivan asked on 2026-10-05 («Ozon
 * (пока заглушка)»). One card in the shape of the shop's empty state: what
 * this is, what the owner can already do (save the key), nothing else. The
 * Wildberries screens take a `marketplace` prop, so when the Ozon adapter
 * delivers its data this page becomes the same six routes under
 * `/marketplaces/ozon/*` and this file goes away.
 */
export const OzonStub = () => {
  const { t } = useTranslation()

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Ozon</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.ozon.subtitle")}
          </Text>
        </div>
        <div className="flex h-[400px] w-full items-center justify-center">
          <div className="flex max-w-md flex-col items-center gap-y-3 px-6 text-center">
            <ShoppingBag className="text-ui-fg-subtle" />
            <Text size="small" leading="compact" weight="plus">
              {t("mp.ozon.title")}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("mp.ozon.message")}
            </Text>
            <Button size="small" variant="secondary" asChild>
              <Link to="/settings/integrations/ozon">
                <Key />
                {t("mp.ozon.keyButton")}
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
