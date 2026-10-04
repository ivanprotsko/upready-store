import { ArrowPath, ExclamationCircle, Link as LinkIcon } from "@medusajs/icons"
import { Button, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  slugOf,
  useMpSyncNow,
  type MarketplaceId,
  type MpPriceStockParams,
  type MpPriceStockResponse,
} from "../../../../hooks/api/marketplace-section"

/**
 * Why the table is empty, in words (rule 20a). Three reasons this screen can
 * tell apart from the answer's `stored` and `counts`; a search or a filter
 * that matched nothing for any other reason is `NoResults` of `_DataTable`.
 *
 *   nothing    no card of the marketplace and no product in the shop
 *   no_prices  cards, and not one line of prices and stocks yet: the import
 *              has not brought them, which is not an empty shop
 *   no_links   «Есть везде» or «выше порога» asked for while no card is
 *              linked to the shop: the comparison needs a link first
 */
export type MpPriceStockEmptyReason = "nothing" | "no_prices" | "no_links"

export const emptyReasonOf = ({
  count,
  stored,
  counts,
  query,
}: {
  count: number
  stored: MpPriceStockResponse["stored"] | undefined
  counts: MpPriceStockResponse["counts"] | undefined
  query: MpPriceStockParams
}): MpPriceStockEmptyReason | null => {
  if (!stored || !counts) {
    return null
  }
  if (stored.cards === 0 && stored.variants === 0) {
    return "nothing"
  }
  if (stored.cards > 0 && stored.lines === 0) {
    return "no_prices"
  }
  const needsLinks =
    query.over_threshold === "true" || (Boolean(query.state?.length) && query.state!.every((state) => state === "both"))
  if (count === 0 && counts.both === 0 && needsLinks) {
    return "no_links"
  }
  return null
}

export const MpPriceStockEmpty = ({
  marketplace,
  reason,
  stored,
}: {
  marketplace: MarketplaceId
  reason: MpPriceStockEmptyReason
  stored: MpPriceStockResponse["stored"] | undefined
}) => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const { mutateAsync: syncNow, isPending } = useMpSyncNow(marketplace)

  const run = async () => {
    if (MP_FIXTURES) {
      toast.success(t("marketplaceSync.syncNow.toastTitle", { count: 1 }))
      return
    }
    try {
      const { results } = await syncNow()
      const started = results.filter((result) => result.outcome === "started").length
      toast.success(
        started
          ? t("marketplaceSync.syncNow.toastTitle", { count: started })
          : t("marketplaceSync.syncNow.toastTitleNone")
      )
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const title = t(`mp.priceStock.empty.${reason}.title`)
  const message = t(`mp.priceStock.empty.${reason}.message`, {
    marketplace: label,
    cards: stored?.cards ?? 0,
  })

  return (
    <div
      className="flex min-h-[150px] w-full flex-col items-center justify-center gap-y-4 px-6 py-8 text-center"
      data-testid={`mp-price-stock-empty-${reason}`}
    >
      <div className="flex flex-col items-center gap-y-3">
        {reason === "no_links" ? (
          <LinkIcon className="text-ui-fg-subtle" />
        ) : (
          <ExclamationCircle className="text-ui-fg-subtle" />
        )}
        <div className="flex flex-col items-center gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            {title}
          </Text>
          <Text size="small" className="text-ui-fg-muted max-w-[480px]">
            {message}
          </Text>
        </div>
      </div>
      {reason === "no_links" ? (
        <Button size="small" variant="secondary" className="max-md:min-h-11" asChild>
          <Link to={`/marketplaces/${slug}/products`}>{t("mp.priceStock.empty.openProducts")}</Link>
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {reason === "no_prices" ? (
            <Button size="small" variant="secondary" className="max-md:min-h-11" isLoading={isPending} onClick={run}>
              <ArrowPath />
              {t("marketplaceSync.syncNow.button")}
            </Button>
          ) : null}
          <Button size="small" variant="transparent" className="max-md:min-h-11" asChild>
            <Link to={`/marketplaces/${slug}/sync`}>{t("mp.priceStock.empty.openSync")}</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
