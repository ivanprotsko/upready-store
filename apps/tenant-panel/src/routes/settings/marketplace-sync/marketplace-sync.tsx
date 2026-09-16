import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useMarketplaceSync } from "../../../hooks/api/marketplace-sync"
import { MpSyncOpsTable } from "./components/mp-sync-ops-table"
import { MpSyncWarnings } from "./components/mp-sync-warnings"

/**
 * «Маркетплейсы → Синхронизация» (w16-mp-scheduler-ops, spec 2.6 and 2.7).
 *
 * The card screen next door answers "what is this marketplace". This one
 * answers the operational question: is the data fresh, and if it is not, WHY —
 * and it is built so that the answer can be NO. A kind that has never run says
 * «ни разу не запускалась» instead of showing a zero; the text of the last
 * failure stays on the screen after a later success; a key expiring inside 14
 * days is a warning at the top, because Ozon keys live three months and this
 * fires four times a year per shop.
 *
 * There is no «запустить сейчас» button. The schedule is a job
 * (`src/jobs/marketplace-sync.ts`) and a manual trigger would be a second way
 * to start a run, with its own idea of the lock.
 *
 * Design system: @medusajs/ui, like every other screen of this panel, which is
 * a fork of Medusa Admin 2.19. The divergence from the Geist canon is the one
 * recorded in w01 and repeated in w12 — importing Geist into an Admin fork
 * would make this one screen unlike the twenty next to it — and it is repeated
 * in this task's report rather than left silent.
 */
export const MarketplaceSyncSettings = () => {
  const { t } = useTranslation()
  const { sync, isPending, isError, error } = useMarketplaceSync()

  if (isError) {
    throw error
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading>{t("marketplaceSync.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceSync.subtitle")}
          </Text>
          <Link
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
            to="/settings/marketplaces"
          >
            {t("marketplaceSync.backToCards")}
          </Link>
        </div>
      </Container>

      {isPending || !sync ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        </Container>
      ) : (
        <>
          <Container className="p-0">
            <div className="flex flex-col gap-y-3 px-6 py-4">
              <MpSyncWarnings warnings={sync.warnings} />
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceSync.scheduleHint", {
                  minutes: Math.round(sync.schedule.stale_lock_ms / 60_000),
                  days: sync.schedule.expiry_warning_days,
                })}
              </Text>
            </div>
          </Container>

          {sync.marketplaces.length === 0 ? (
            <Container className="p-0">
              <div className="px-6 py-6">
                {/* Zero adapters is a backend error, never an empty screen (rule 20a). */}
                <Text className="text-ui-fg-error" size="small">
                  {t("marketplaces.empty")}
                </Text>
              </div>
            </Container>
          ) : (
            sync.marketplaces.map((entry) => (
              <Container className="divide-y p-0" key={entry.id}>
                <div className="px-6 py-4">
                  <Heading level="h2">{entry.label}</Heading>
                  <Text className="text-ui-fg-subtle" size="small">
                    {entry.connection.key.set
                      ? t("marketplaceSync.keySet", {
                          last4: entry.connection.key.last4 ?? "????",
                          until: entry.credentials.expires_at
                            ? new Date(entry.credentials.expires_at).toLocaleDateString()
                            : t("marketplaceSync.noExpiry"),
                        })
                      : t("marketplaces.key.missing")}
                  </Text>
                </div>
                <div className="px-6 py-4">
                  <MpSyncOpsTable entry={entry} now={sync.now} />
                </div>
              </Container>
            ))
          )}
        </>
      )}
    </SingleColumnPage>
  )
}
