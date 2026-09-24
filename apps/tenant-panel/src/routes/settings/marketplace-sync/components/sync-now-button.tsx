import { Spinner } from "@medusajs/icons"
import { Button, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  useSyncMarketplacesNow,
  type MarketplaceSyncEntry,
  type SyncNowResult,
} from "../../../../hooks/api/marketplace-sync"

/**
 * «Обновить сейчас» (t-2026-09-24-n6, w6-mp-orders-sync-now).
 *
 * Ivan, 2026-09-24: after saving a key the owner had no way to ask for the
 * first import without waiting for the scheduler's own tick. This button asks
 * the backend to start every connected marketplace's every kind now; the
 * request answers as soon as each kind has been told to start or told why
 * not, not after the import itself finishes, so the button re-enables long
 * before the data has actually arrived — the table below is what shows that.
 *
 * A kind the backend SKIPPED is never folded into a silent success: the toast
 * names what started and what did not, with the marketplace's own reason
 * (rule 20a). A 409 — a sync already running for this shop — surfaces as the
 * backend's own Russian sentence, the same way every other mutation in this
 * panel reports its own refusal.
 */

const label = (
  result: SyncNowResult,
  marketplaces: MarketplaceSyncEntry[],
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const marketplaceLabel =
    marketplaces.find((entry) => entry.id === result.marketplace)?.label ?? result.marketplace

  if (result.kind === "*") {
    return `${marketplaceLabel} (${t(`marketplaceSync.syncNow.reasons.${result.reason}`, {
      defaultValue: result.reason,
    })})`
  }

  const kindLabel = t(`marketplaces.kinds.${result.kind}`, { defaultValue: result.kind })
  const where = `${marketplaceLabel} / ${kindLabel}`

  return result.outcome === "started"
    ? where
    : `${where} (${t(`marketplaceSync.syncNow.reasons.${result.reason}`, {
        defaultValue: result.reason,
      })})`
}

export const SyncNowButton = ({ marketplaces }: { marketplaces: MarketplaceSyncEntry[] }) => {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useSyncMarketplacesNow()

  const run = async () => {
    try {
      const { results } = await mutateAsync()
      const started = results.filter((result) => result.outcome === "started")
      const skipped = results.filter((result) => result.outcome === "skipped")

      toast.success(
        started.length
          ? t("marketplaceSync.syncNow.toastTitle", { count: started.length })
          : t("marketplaceSync.syncNow.toastTitleNone"),
        {
          description: [
            started.length
              ? t("marketplaceSync.syncNow.toastStarted", {
                  list: started.map((result) => label(result, marketplaces, t)).join(", "),
                })
              : null,
            skipped.length
              ? t("marketplaceSync.syncNow.toastSkipped", {
                  list: skipped.map((result) => label(result, marketplaces, t)).join(", "),
                })
              : null,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
        }
      )
    } catch (error) {
      // The backend answers a running sync with its own Russian sentence
      // (409, `type: "sync_in_progress"`), which `FetchError.message` already
      // carries — the same shape every other mutation of this panel reports.
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Button size="small" variant="secondary" disabled={isPending} onClick={run}>
      {isPending ? (
        <span className="flex items-center gap-x-1.5">
          <Spinner className="animate-spin" />
          {t("marketplaceSync.syncNow.running")}
        </span>
      ) : (
        t("marketplaceSync.syncNow.button")
      )}
    </Button>
  )
}
