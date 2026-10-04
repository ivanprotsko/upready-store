import { ArrowPath, ExclamationCircle, Key } from "@medusajs/icons"
import { Button, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useSyncMarketplacesNow } from "../../../../hooks/api/marketplace-sync"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  slugOf,
  type MarketplaceId,
  type MpProductsResponse,
} from "../../../../hooks/api/marketplace-section"

/**
 * The empty list, saying WHY it is empty (rule 20a): the marketplace has not
 * sent a single card, and the owner reads which of two things to do about it.
 *
 *   no key stored        -> «Ключ Wildberries не сохранён» + «Сохранить ключ»
 *   key, nothing came    -> «Карточки ещё не приходили» + «Обновить сейчас»
 *   key, last run failed -> «Обновление карточек не удалось» + «Обновить сейчас»
 *
 * The third reason, a search or a filter that matched nothing, is the
 * `NoResults` of `_DataTable` and never reaches this component.
 *
 * The same block as `NoRecords` of the shop's tables (icon, two lines, one
 * button), with a button that can run a mutation rather than only a link.
 */
export const MpProductsEmpty = ({
  marketplace,
  sync,
}: {
  marketplace: MarketplaceId
  sync: MpProductsResponse["sync"] | undefined
}) => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const { mutateAsync: syncNow, isPending } = useSyncMarketplacesNow()

  const run = async () => {
    if (MP_FIXTURES) {
      toast.success(t("marketplaceSync.syncNow.toastTitle", { count: 1 }))
      return
    }
    try {
      const { results } = await syncNow()
      const started = results.filter((r) => r.outcome === "started").length
      toast.success(
        started
          ? t("marketplaceSync.syncNow.toastTitle", { count: started })
          : t("marketplaceSync.syncNow.toastTitleNone")
      )
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const noKey = sync ? !sync.key_set : false
  const failed = sync?.status === "failed"

  const title = noKey
    ? t("mp.products.empty.noKeyTitle", { marketplace: label })
    : failed
      ? t("mp.products.empty.failedTitle")
      : t("mp.products.empty.title")
  const message = noKey
    ? t("mp.products.empty.noKeyMessage", { marketplace: label })
    : failed
      ? t("mp.products.empty.failedMessage", { marketplace: label })
      : t("mp.products.empty.message", { marketplace: label })

  return (
    <div
      className="flex min-h-[150px] w-full flex-col items-center justify-center gap-y-4 px-6 py-8 text-center"
      data-testid={noKey ? "mp-products-empty-no-key" : failed ? "mp-products-empty-failed" : "mp-products-empty-never"}
    >
      <div className="flex flex-col items-center gap-y-3">
        {noKey ? <Key className="text-ui-fg-subtle" /> : <ExclamationCircle className="text-ui-fg-subtle" />}
        <div className="flex flex-col items-center gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            {title}
          </Text>
          <Text size="small" className="text-ui-fg-muted max-w-[480px]">
            {message}
          </Text>
        </div>
      </div>
      {noKey ? (
        <Button size="small" variant="secondary" className="max-md:min-h-11" asChild>
          <Link to={`/settings/integrations/${slug}`}>{t("mp.products.empty.saveKey")}</Link>
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="small" variant="secondary" className="max-md:min-h-11" isLoading={isPending} onClick={run}>
            <ArrowPath />
            {t("mp.products.empty.syncNow")}
          </Button>
          {failed ? (
            <Button size="small" variant="transparent" className="max-md:min-h-11" asChild>
              <Link to={`/marketplaces/${slug}/sync`}>{t("mp.products.empty.openSync")}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
