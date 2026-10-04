import { ArrowUturnLeft } from "@medusajs/icons"
import { Container, Copy, Heading, StatusBadge, Text } from "@medusajs/ui"
import { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useParams } from "react-router-dom"

import { Thumbnail } from "../../../../components/common/thumbnail"
import { TwoColumnPageSkeleton } from "../../../../components/common/skeleton"
import { SupportDetails } from "../../../../components/common/support-details"
import { TwoColumnPage } from "../../../../components/layout/pages"
import {
  useMarketplaceOrder,
  type MarketplaceOrderDetail,
  type MarketplaceOrderLine,
} from "../../../../hooks/api/marketplace-orders"
import {
  MARKETPLACE_LABEL,
  slugOf,
  type MarketplaceId,
} from "../../../../hooks/api/marketplace-section"
import { useDate } from "../../../../hooks/use-date"
import { getLocaleAmount } from "../../../../lib/money-amount-helpers"
import { ORDER_STATUS_COLOR, rawStatusOf } from "../order-status"

/**
 * The card of ONE marketplace order (w15-mp-orders-desk), laid out like the
 * shop's own `/orders/:id` since mp-section-design task-04: the number and the
 * status on top, «Состав заказа» under it, the buyer, the history and what we
 * loaded on the side.
 *
 * Everything on it comes from `mp_order` / `mp_order_line` / `mp_link` /
 * `mp_order_status_event` — our own tables, filled by an import script. The
 * screen READS. There is no «принять», no «отгрузить», no «печать этикетки»
 * and no status change, and a backend test reads this file to make sure that
 * stays true (Ivan, 2026-09-16 02:46 WITA).
 *
 * TWO THINGS THE CARD IS CAREFUL ABOUT.
 *
 * The marketplace's own status words are shown UNTRANSLATED next to our common
 * label, because the common label exists to make one filter possible and not to
 * replace WB's vocabulary with ours (rule 17a).
 *
 * The history is labelled «что мы видели при загрузках». Neither marketplace
 * gives out a status log, so this is our observation with our clock on it, and
 * calling it «история статусов Wildberries» would be an invention.
 *
 * «Назад» keeps the list's own address: the list hands its `location.search`
 * to the card, and the card hands it back, so the owner returns to the same
 * filters and the same page.
 */

export const MpOrderDetail = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { id } = useParams()
  const { search } = useLocation()
  const { detail, isPending, isError, error } = useMarketplaceOrder(marketplace, id!)

  if (isError) {
    throw error
  }

  if (isPending || !detail) {
    return <TwoColumnPageSkeleton mainSections={2} sidebarSections={3} />
  }

  const back = `/marketplaces/${slugOf(marketplace)}/orders${search}`

  return (
    <TwoColumnPage
      widgets={{ before: [], after: [], sideBefore: [], sideAfter: [] }}
      hasOutlet={false}
    >
      <TwoColumnPage.Main>
        <GeneralSection detail={detail} marketplace={marketplace} back={back} />
        <LinesSection detail={detail} marketplace={marketplace} />
      </TwoColumnPage.Main>
      <TwoColumnPage.Sidebar>
        <BuyerSection detail={detail} />
        <HistorySection detail={detail} />
        <LoadedSection detail={detail} />
      </TwoColumnPage.Sidebar>
    </TwoColumnPage>
  )
}

const GeneralSection = ({
  detail,
  marketplace,
  back,
}: {
  detail: MarketplaceOrderDetail
  marketplace: MarketplaceId
  back: string
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { order } = detail
  const label = MARKETPLACE_LABEL[marketplace]

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-3">
        <Link
          to={back}
          className="text-ui-fg-subtle hover:text-ui-fg-base txt-compact-small-plus inline-flex min-h-8 items-center gap-x-1.5 max-md:min-h-11"
          data-testid="order-back"
        >
          <ArrowUturnLeft />
          {t("marketplaceOrders.detail.back", { marketplace: label })}
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-x-1">
            <Heading className="truncate" data-testid="order-number">
              {order.number}
            </Heading>
            <Copy content={order.number} className="text-ui-fg-muted" />
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {order.ordered_at
              ? t("marketplaceOrders.detail.subtitle", {
                  date: getFullDate({ date: order.ordered_at, includeTime: true }),
                  marketplace: label,
                })
              : t("marketplaceOrders.detail.subtitleUndated", { marketplace: label })}
            {order.scheme ? ` · ${order.scheme}` : ""}
          </Text>
        </div>
        <StatusBadge color={ORDER_STATUS_COLOR[order.status_key] ?? "grey"} className="text-nowrap">
          {order.status_label}
        </StatusBadge>
      </div>
      <div className="px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          {t("marketplaceOrders.detail.readOnly")}
        </Text>
      </div>
    </Container>
  )
}

const money = (amount: number | null, currency: string | null) =>
  amount === null ? "-" : getLocaleAmount(amount, currency ?? "RUB")

const LinesSection = ({
  detail,
  marketplace,
}: {
  detail: MarketplaceOrderDetail
  marketplace: MarketplaceId
}) => {
  const { t } = useTranslation()
  const { order, lines } = detail

  return (
    <Container className="divide-y divide-dashed p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("marketplaceOrders.detail.lines")}</Heading>
      </div>
      {lines.length === 0 ? (
        <div className="px-6 py-4">
          {/* Ноль строк — это дефект импорта, а не «пустой заказ» (правило 20a). */}
          <Text className="text-ui-fg-error" size="small">
            {t("marketplaceOrders.detail.noLines")}
          </Text>
        </div>
      ) : (
        lines.map((line) => (
          <LineRow key={line.id} line={line} currency={order.currency} marketplace={marketplace} />
        ))
      )}
      <div className="flex items-center justify-between px-6 py-4">
        <Text size="small" weight="plus" leading="compact">
          {t("fields.total")}
        </Text>
        <Text size="small" weight="plus" leading="compact" className="tabular-nums">
          {money(order.total, order.currency)}
        </Text>
      </div>
    </Container>
  )
}

const LineRow = ({
  line,
  currency,
  marketplace,
}: {
  line: MarketplaceOrderLine
  currency: string | null
  marketplace: MarketplaceId
}) => {
  const { t } = useTranslation()
  /** WB puts one item per line (qty 1, the line's sum as price); Ozon a unit price and a quantity. */
  const sum = line.price !== null && line.qty !== null ? line.price * line.qty : line.price

  return (
    <div
      className="text-ui-fg-subtle grid grid-cols-2 items-center gap-x-4 px-6 py-4 max-md:grid-cols-1 max-md:gap-y-2"
      data-testid="order-line"
    >
      <div className="flex min-w-0 items-start gap-x-4">
        <Thumbnail src={line.thumbnail} />
        <div className="min-w-0">
          {line.product ? (
            <Link
              to={`/products/${line.product.id}`}
              className="text-ui-fg-base hover:text-ui-fg-interactive txt-compact-small block truncate"
            >
              {line.product.title ?? line.marketplace_title ?? line.product.id}
            </Link>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-base truncate">
              {line.marketplace_title ?? line.vendor_code ?? "-"}
            </Text>
          )}
          <Text size="small" className="truncate">
            {line.vendor_code
              ? t("marketplaceOrders.detail.vendorCodeValue", { code: line.vendor_code })
              : null}
            {line.vendor_code && line.external_id ? " · " : null}
            {line.external_id ? (
              <Link
                to={`/marketplaces/${slugOf(marketplace)}/products?q=${encodeURIComponent(line.external_id)}`}
                className="hover:text-ui-fg-interactive"
              >
                {t("marketplaceOrders.detail.cardValue", { id: line.external_id })}
              </Link>
            ) : null}
          </Text>
          {line.product ? null : (
            /* Артикул виден выше, чтобы владелица знала, КАКОГО товара нет. */
            <Text size="small" className="text-ui-fg-muted" data-testid="line-unlinked">
              {t("marketplaceOrders.detail.notInShop")}
            </Text>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 items-center gap-x-4">
        <div className="flex items-center justify-end">
          <Text size="small" className="tabular-nums">
            {money(line.price, currency)}
          </Text>
        </div>
        <div className="flex items-center">
          <Text size="small" className="tabular-nums">
            {line.qty === null ? "-" : `${line.qty}x`}
          </Text>
        </div>
        <div className="flex items-center justify-end">
          <Text size="small" className="tabular-nums">
            {money(sum, currency)}
          </Text>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="text-ui-fg-subtle grid grid-cols-2 items-start gap-x-4 px-6 py-4">
    <Text size="small" weight="plus" leading="compact">
      {label}
    </Text>
    <Text size="small" leading="compact" className="text-pretty break-words">
      {children}
    </Text>
  </div>
)

const BuyerSection = ({ detail }: { detail: MarketplaceOrderDetail }) => {
  const { t } = useTranslation()
  const { order } = detail
  const unknown = t("marketplaceOrders.detail.notReported")

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("marketplaceOrders.detail.buyer")}</Heading>
      </div>
      <Field label={t("marketplaceOrders.detail.region")}>{order.buyer_region ?? unknown}</Field>
      <Field label={t("marketplaceOrders.detail.warehouse")}>{order.warehouse_name ?? unknown}</Field>
    </Container>
  )
}

const HistorySection = ({ detail }: { detail: MarketplaceOrderDetail }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { status_history: history } = detail

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">{t("marketplaceOrders.detail.history")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("marketplaceOrders.detail.historyHint")}
        </Text>
      </div>
      {history.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("marketplaceOrders.detail.historyEmpty")}
          </Text>
        </div>
      ) : (
        <ol className="flex flex-col gap-y-3 px-6 py-4">
          {history.map((event) => (
            <li
              key={`${event.observed_at}-${event.status}-${event.status_detail}`}
              className="grid grid-cols-[12px_1fr] gap-x-3"
              data-testid="history-row"
            >
              <div className="flex justify-center pt-1.5">
                <div className="bg-ui-tag-neutral-icon size-1.5 rounded-full" />
              </div>
              <div className="flex min-w-0 flex-col">
                <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base break-words">
                  {rawStatusOf(event.status, event.status_detail) ??
                    t("marketplaceOrders.detail.noStatusWord")}
                </Text>
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  {event.observed_at
                    ? getFullDate({ date: event.observed_at, includeTime: true })
                    : "-"}
                </Text>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Container>
  )
}

const LoadedSection = ({ detail }: { detail: MarketplaceOrderDetail }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { order } = detail
  const technical = [
    `id: ${order.id}`,
    order.source_row_id ? `source_row_id: ${order.source_row_id}` : null,
    `status: ${order.status_raw ?? "null"}`,
    `status_detail: ${order.status_detail ?? "null"}`,
  ]
    .filter(Boolean)
    .join("\n")

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("marketplaceOrders.detail.syncedAt")}</Heading>
      </div>
      <Field label={t("marketplaceOrders.detail.lastLoaded")}>
        {order.synced_at ? getFullDate({ date: order.synced_at, includeTime: true }) : "-"}
      </Field>
      <Field label={t("marketplaceOrders.detail.statusRaw")}>
        {rawStatusOf(order.status_raw, order.status_detail) ??
          t("marketplaceOrders.detail.noStatusWord")}
      </Field>
      <Field label={t("marketplaceOrders.detail.statusChangedAt")}>
        {order.status_changed_at
          ? getFullDate({ date: order.status_changed_at, includeTime: true })
          : t("marketplaceOrders.detail.statusChangedUnknown")}
      </Field>
      <div className="px-6 py-2">
        <SupportDetails text={technical} />
      </div>
    </Container>
  )
}
