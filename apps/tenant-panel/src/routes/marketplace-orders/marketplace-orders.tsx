import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { SingleColumnPage } from "../../components/layout/pages"
import {
  marketplaceOrdersExportPath,
  useMarketplaceOrders,
  type FeedOrder,
} from "../../hooks/api/marketplace-orders"
import { sdk } from "../../lib/client"
import { FeedFilters } from "./components/feed-filters"
import { SyncBanner } from "./components/sync-banner"

/**
 * «Заказы маркетплейсов» — the shop's own orders and every marketplace's in ONE
 * table (w15-mp-orders-desk, parity matrix rows 2/6/7/21).
 *
 * Oksana's own words: «единая панель заказов WB + Ozon + магазин»
 * (`research/gap-matrix.md`, сообщение #468851).
 *
 * READ-ONLY. There is no action on a marketplace order anywhere on this screen:
 * no «принять», no «отгрузить», no «печать этикетки», no status change. The
 * only two buttons act on this screen — the filters and the CSV of what the
 * filters selected. A backend test reads this file and fails if a mutation
 * appears in it (Ivan, 2026-09-16 02:46 WITA).
 *
 * THE URL IS THE STATE. Every filter lives in the query string, so a view can
 * be sent to someone; the screen keeps no filter state of its own.
 *
 * Design system: @medusajs/ui, like every screen of this panel, which is a copy
 * of Medusa Admin 2.19 and has no Geist in its dependencies. The divergence
 * from canon 27 is the one recorded in w01 and repeated in this task's report.
 */

const LIMIT = 50

const formatMoney = (total: number | null, currency: string | null, locale: string) => {
  if (total === null) {
    /* Нет суммы — это НЕ ноль (правило 20a): площадка её не прислала. */
    return "—"
  }
  if (!currency) {
    return new Intl.NumberFormat(locale).format(total)
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(total)
  } catch {
    /* Незнакомый код валюты — показываем число и код, а не падаем. */
    return `${new Intl.NumberFormat(locale).format(total)} ${currency}`
  }
}

const formatDate = (value: string | null, locale: string) =>
  value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value)
      )
    : "—"

/**
 * A calendar day (`YYYY-MM-DD`) printed as a day.
 *
 * `new Date("2026-09-16")` is midnight UTC, which in a UTC+8 shop is still the
 * 16th, while `new Date("2026-09-16T23:59:59.999Z")` — the period's own upper
 * bound — is already the 17th there. So the screen formats the DAY the backend
 * used and never the instant: the label said «по 17 сентября» for a period that
 * ended on the 16th before this was fixed (measured on the stand).
 */
const formatDay = (day: string, locale: string) => {
  const [year, month, date] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(year, (month ?? 1) - 1, date ?? 1)
  )
}

/**
 * Where a row leads. A marketplace order opens the card this task adds; a shop
 * order opens the order screen the panel already has, rather than a thinner
 * second copy of it (rule 20).
 */
const rowHref = (order: FeedOrder) =>
  order.source === "shop" ? `/orders/${order.id}` : `/marketplace-orders/${order.id}`

export const MarketplaceOrders = () => {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()

  const search = params.toString()
  const { feed, isPending, isError, error } = useMarketplaceOrders(search)

  if (isError) {
    throw error
  }

  const toggle = useCallback(
    (key: "source" | "scheme" | "status", value: string) => {
      const next = new URLSearchParams(params)
      const current = (next.get(key) ?? "").split(",").filter(Boolean)
      const updated = current.includes(value)
        ? current.filter((one) => one !== value)
        : [...current, value]

      if (updated.length) {
        next.set(key, updated.join(","))
      } else {
        next.delete(key)
      }
      next.delete("offset")
      setParams(next)
    },
    [params, setParams]
  )

  const setPeriod = useCallback(
    (from: string | null, to: string | null) => {
      const next = new URLSearchParams(params)
      if (from) {
        next.set("from", from)
      } else {
        next.delete("from")
      }
      if (to) {
        next.set("to", to)
      } else {
        next.delete("to")
      }
      next.delete("offset")
      setParams(next)
    },
    [params, setParams]
  )

  const reset = useCallback(() => setParams(new URLSearchParams()), [setParams])

  const applied = useMemo(
    () => ({
      source: (params.get("source") ?? "").split(",").filter(Boolean),
      scheme: (params.get("scheme") ?? "").split(",").filter(Boolean),
      status: (params.get("status") ?? "").split(",").filter(Boolean),
    }),
    [params]
  )

  const hasAnyFilter =
    applied.source.length > 0 ||
    applied.scheme.length > 0 ||
    applied.status.length > 0 ||
    Boolean(params.get("from")) ||
    Boolean(params.get("to"))

  /**
   * The export is fetched through the SDK rather than opened as a link,
   * because the panel authenticates with a bearer token the browser would not
   * attach to a plain navigation. Same query string as the table, so the file
   * is the table (the PR counts both).
   *
   * `accept: text/csv` is what makes the SDK hand back the raw `Response`: it
   * parses the body as JSON only when the accept header asks for JSON
   * (`@medusajs/js-sdk` 2.19, `client.js` line 102). With the default header the
   * CSV would arrive as a parse error.
   */
  const download = useCallback(async () => {
    const response = await sdk.client.fetch<Response>(marketplaceOrdersExportPath(search), {
      headers: { accept: "text/csv" },
    })
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `marketplace-orders-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [search])

  const locale = i18n.language || "ru"

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div>
            <Heading>{t("marketplaceOrders.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaceOrders.subtitle")}
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={download}
            disabled={!feed || feed.count === 0}
            data-testid="export-csv"
          >
            {t("marketplaceOrders.export", { count: feed?.count ?? 0 })}
          </Button>
        </div>

        {feed ? (
          <div className="px-6 pb-4">
            {/* Экран НАЗЫВАЕТ период, в том числе когда выбрал его сам. */}
            <Text className="text-ui-fg-subtle" size="small" data-testid="period-line">
              {feed.period.is_default
                ? t("marketplaceOrders.period.default", {
                    days: feed.period.default_days,
                    from: formatDay(feed.period.from_day, locale),
                    to: formatDay(feed.period.to_day, locale),
                  })
                : t("marketplaceOrders.period.chosen", {
                    from: formatDay(feed.period.from_day, locale),
                    to: formatDay(feed.period.to_day, locale),
                  })}
            </Text>
            {feed.undated > 0 ? (
              <Text className="text-ui-fg-muted" size="small" data-testid="undated-line">
                {t("marketplaceOrders.period.undated", { count: feed.undated })}
              </Text>
            ) : null}
          </div>
        ) : null}
      </Container>

      {feed ? <Container className="p-0">
        <SyncBanner connections={feed.connections} />
      </Container> : null}

      <Container className="p-0">
        {feed ? (
          <FeedFilters
            facets={feed.facets}
            applied={applied}
            from={params.get("from") ?? ""}
            to={params.get("to") ?? ""}
            onToggle={toggle}
            onPeriod={setPeriod}
            onReset={reset}
            hasAnyFilter={hasAnyFilter}
          />
        ) : null}
      </Container>

      <Container className="p-0">
        {isPending || !feed ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaceOrders.loading")}
            </Text>
          </div>
        ) : feed.orders.length === 0 ? (
          <div className="px-6 py-6">
            {/* Пустой результат НАЗЫВАЕТ период, а не молчит (правило 20a). */}
            <Text className="text-ui-fg-subtle" size="small" data-testid="empty-state">
              {t("marketplaceOrders.empty", {
                from: formatDay(feed.period.from_day, locale),
                to: formatDay(feed.period.to_day, locale),
              })}
            </Text>
          </div>
        ) : (
          <>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.source")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.number")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.date")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.scheme")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.status")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("marketplaceOrders.columns.region")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("marketplaceOrders.columns.total")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {feed.orders.map((order) => (
                  <Table.Row key={order.id} data-testid="feed-row">
                    <Table.Cell>
                      <Badge size="2xsmall" color={order.source === "shop" ? "green" : "grey"}>
                        {order.source_label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Link className="text-ui-fg-interactive" to={rowHref(order)}>
                        {order.number}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{formatDate(order.ordered_at, locale)}</Table.Cell>
                    <Table.Cell>{order.scheme ?? "—"}</Table.Cell>
                    <Table.Cell title={order.status_detail ?? undefined}>
                      {/* o21-owner-panel-ux (P3): the marketplace's own status
                          code stays out of the owner's sight; the detail the
                          marketplace wrote in words is kept, in the title. */}
                      <Text size="small" className="truncate">
                        {order.status_label}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{order.buyer_region ?? "—"}</Table.Cell>
                    <Table.Cell className="text-right">
                      {formatMoney(order.total, order.currency, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>

            <div className="flex items-center justify-between gap-x-4 px-6 py-4">
              <Text className="text-ui-fg-subtle" size="small" data-testid="count-line">
                {t("marketplaceOrders.shown", {
                  shown: feed.orders.length,
                  count: feed.count,
                })}
              </Text>
              {feed.count > feed.orders.length + feed.offset ? (
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.set("offset", String(feed.offset + LIMIT))
                    setParams(next)
                  }}
                >
                  {t("marketplaceOrders.more")}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
