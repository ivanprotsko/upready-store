import { useTranslation } from "react-i18next"
import { Container, Heading } from "@medusajs/ui"

import { SingleColumnPage } from "../../components/layout/pages"
import { useMe } from "../../hooks/api/users"
import { OverviewStats } from "./overview-stats"
import { SalesSummary } from "./sales-summary"
import { DeveloperDetails } from "./developer-details"
import { OwnerAttention } from "./owner-attention"
import { OwnerLaunch } from "./owner-launch"
import { PlanInfo } from "./plan-info"

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
      <OwnerAttention />
      <OwnerLaunch />
      <Container className="flex flex-col gap-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Heading level="h1">
            {isPending ? t("general.loading") : tenant?.name}
          </Heading>
          <PlanInfo tenant={tenant} />
        </div>

        <OverviewStats />

        <SalesSummary />

        <DeveloperDetails tenant={tenant} />
      </Container>
    </SingleColumnPage>
  )
}
