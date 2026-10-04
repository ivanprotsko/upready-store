import { Badge, Button, Container, DatePicker, Heading, Label, Table, Text } from "@medusajs/ui"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { useMarketplaceAnalytics } from "../../../../hooks/api/marketplace-analytics"
import { CardsTable } from "./components/cards-table"
import { SalesChart } from "../../../marketplaces/mp-analytics/components/sales-chart"
import { SourceBlock } from "./components/source-block"

/**
 * «Маркетплейсы → Аналитика» — дашборд селлера (w19-mp-analytics, строки
 * 14/15/16/17/19/20 матрицы паритета).
 *
 * ТОЛЬКО ЧТЕНИЕ. Экран складывает то, что импорт положил в `mp_order`,
 * `mp_order_line` и `mp_offer`, и ничего никуда не отправляет: ни одной
 * мутации, ни одного обращения к площадке при открытии (приказ Ивана
 * 2026-09-16 02:46 WITA). Тест бэкенда читает этот файл и падает, если тут
 * появится `useMutation`.
 *
 * АДРЕС — ЭТО СОСТОЯНИЕ: период и фильтр площадки живут в query string, чтобы
 * вид можно было переслать; своего состояния фильтров экран не держит.
 *
 * У КАЖДОГО БЛОКА НАПИСАНО, ОТКУДА ЧИСЛО. Формулы приходят с бэкенда — те же,
 * по которым считалось, — поэтому подпись и число не могут разойтись
 * (правило 18e). Там, где числа нет, стоит причина словами, а не ноль.
 *
 * Дизайн-система: @medusajs/ui, как на всех экранах этой панели — она копия
 * Medusa Admin 2.19, Geist в её зависимостях нет. Расхождение с каноном 27
 * зафиксировано в отчёте w01 и повторено здесь.
 */

const DEFAULT_LIMIT = 50

const asDate = (value: string): Date | undefined => {
  if (!value) {
    return undefined
  }
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return undefined
  }
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * `Date` -> `YYYY-MM-DD` по ЛОКАЛЬНОМУ календарю.
 *
 * `toISOString().slice(0,10)` от полуночи по местному времени восточнее
 * Гринвича даёт ПРЕДЫДУЩИЙ день, адрес переписывается сам и период уезжает на
 * день за перерисовку — измерено на стенде задачи w15.
 */
const asIsoDay = (value: Date | null): string | null => {
  if (!value || Number.isNaN(value.getTime())) {
    return null
  }
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${value.getFullYear()}-${month}-${day}`
}

/** День `YYYY-MM-DD`, напечатанный как день: момент сдвинулся бы часовым поясом. */
const formatDay = (day: string, locale: string) => {
  const [year, month, date] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(year, (month ?? 1) - 1, date ?? 1)
  )
}

const Metric = ({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string | null
}) => (
  <div className="flex flex-col gap-y-1">
    <Text className="text-ui-fg-subtle" size="xsmall">
      {label}
    </Text>
    <Text size="large" weight="plus">
      {value}
    </Text>
    {hint ? (
      <Text className="text-ui-fg-muted" size="xsmall">
        {hint}
      </Text>
    ) : null}
  </div>
)

export const MarketplaceAnalytics = () => {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()

  const search = params.toString()
  const { analytics, isPending, isError, error } = useMarketplaceAnalytics(search)

  if (isError) {
    throw error
  }

  const locale = i18n.language || "ru"

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

  const toggleMarketplace = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params)
      const current = (next.get("marketplace") ?? "").split(",").filter(Boolean)
      const updated = current.includes(value)
        ? current.filter((one) => one !== value)
        : [...current, value]
      if (updated.length) {
        next.set("marketplace", updated.join(","))
      } else {
        next.delete("marketplace")
      }
      next.delete("offset")
      setParams(next)
    },
    [params, setParams]
  )

  const reset = useCallback(() => setParams(new URLSearchParams()), [setParams])

  const appliedMarketplaces = useMemo(
    () => (params.get("marketplace") ?? "").split(",").filter(Boolean),
    [params]
  )

  const marketplaceLabels = useMemo(
    () =>
      Object.fromEntries(
        (analytics?.facets ?? []).map((facet) => [facet.marketplace, facet.label])
      ),
    [analytics]
  )

  const money = useCallback(
    (value: number | null, fraction = 0) => {
      if (value === null) {
        return "—"
      }
      const formatted = new Intl.NumberFormat(locale, {
        maximumFractionDigits: fraction,
      }).format(value)
      return analytics?.seller_currency ? `${formatted} ${analytics.seller_currency}` : formatted
    },
    [analytics, locale]
  )

  if (isPending || !analytics) {
    return (
      <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        </Container>
      </SingleColumnPage>
    )
  }

  const period = analytics.period
  const periodText = `${formatDay(period.from_day, locale)} — ${formatDay(period.to_day, locale)}`
  const hasSales = analytics.totals.orders > 0
  const shownCards = analytics.cards
  const more = analytics.cards_count - (analytics.offset + shownCards.length)

  /** Карточки, которые кончатся раньше двух недель: то, ради чего считают срок. */
  const running = shownCards
    .filter((card) => card.turnover.days_to_zero !== null && card.turnover.days_to_zero <= 14)
    .slice(0, 10)

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading>{t("marketplaceAnalytics.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceAnalytics.subtitle")}
          </Text>
          <Link
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus mt-2 block w-fit"
            to="/settings/marketplaces"
          >
            {t("marketplaceSync.backToCards")}
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-ui-border-base px-6 py-4">
          <div className="flex flex-col gap-y-2">
            <Label size="xsmall" weight="plus">
              {t("marketplaceAnalytics.filters.from")}
            </Label>
            <DatePicker
              value={asDate(params.get("from") ?? period.from_day)}
              onChange={(value) => setPeriod(asIsoDay(value), params.get("to"))}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="xsmall" weight="plus">
              {t("marketplaceAnalytics.filters.to")}
            </Label>
            <DatePicker
              value={asDate(params.get("to") ?? period.to_day)}
              onChange={(value) => setPeriod(params.get("from"), asIsoDay(value))}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="xsmall" weight="plus">
              {t("marketplaceAnalytics.filters.marketplace")}
            </Label>
            <div className="flex gap-x-2">
              {analytics.facets.map((facet) => (
                <Button
                  key={facet.marketplace}
                  size="small"
                  variant={
                    appliedMarketplaces.includes(facet.marketplace) ? "primary" : "secondary"
                  }
                  onClick={() => toggleMarketplace(facet.marketplace)}
                >
                  {`${facet.label} · ${facet.orders}`}
                </Button>
              ))}
              <Button size="small" variant="transparent" onClick={reset}>
                {t("marketplaceAnalytics.filters.reset")}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-ui-border-base px-6 py-3">
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceAnalytics.period", { period: periodText, days: period.days })}
            {period.is_default
              ? ` ${t("marketplaceAnalytics.periodDefault", { days: period.default_days })}`
              : ""}
          </Text>
          {analytics.undated > 0 ? (
            <Text className="text-ui-fg-muted" size="xsmall">
              {t("marketplaceAnalytics.undated", { count: analytics.undated })}
            </Text>
          ) : null}
        </div>
      </Container>

      {/* Состояние импортов: пустой экран объясняется здесь, а не молчит. */}
      <Container className="p-0">
        <div className="flex flex-col gap-y-2 px-6 py-4">
          {analytics.connections.map((connection) => (
            <Text className="text-ui-fg-subtle" key={connection.marketplace} size="small">
              {connection.connected
                ? t("marketplaceAnalytics.connection.ok", {
                    label: connection.label,
                    orders: connection.orders_in_period,
                    status: connection.last_run
                      ? `${connection.last_run.kind}: ${connection.last_run.status}`
                      : t("marketplaceAnalytics.connection.neverRun"),
                  })
                : t("marketplaceAnalytics.connection.noKey", { label: connection.label })}
            </Text>
          ))}
        </div>
      </Container>

      {!hasSales ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            {/* Пустой период называет период, а не рисует пустой график (правило 20a). */}
            <Text size="small">
              {t("marketplaceAnalytics.empty", { period: periodText })}
            </Text>
            {analytics.totals.stock_units !== null ? (
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceAnalytics.emptyStock", {
                  units: new Intl.NumberFormat(locale).format(analytics.totals.stock_units),
                })}
              </Text>
            ) : null}
          </div>
        </Container>
      ) : (
        <>
          <Container className="p-0">
            <div className="grid grid-cols-2 gap-6 px-6 py-4 md:grid-cols-6">
              <Metric
                label={t("marketplaceAnalytics.metrics.revenue")}
                value={money(analytics.totals.revenue)}
                hint={t("marketplaceAnalytics.metrics.revenueHint")}
              />
              <Metric
                label={t("marketplaceAnalytics.metrics.orders")}
                value={new Intl.NumberFormat(locale).format(analytics.totals.orders)}
                hint={t("marketplaceAnalytics.metrics.ordersHint")}
              />
              <Metric
                label={t("marketplaceAnalytics.metrics.units")}
                value={`${new Intl.NumberFormat(locale).format(analytics.totals.units)} шт`}
              />
              <Metric
                label={t("marketplaceAnalytics.metrics.avgOrder")}
                value={money(analytics.totals.avg_order)}
              />
              <Metric
                label={t("marketplaceAnalytics.metrics.cancelled")}
                value={`${new Intl.NumberFormat(locale).format(
                  analytics.totals.cancelled_orders
                )} зак.`}
                hint={t("marketplaceAnalytics.metrics.cancelledHint", {
                  amount: money(analytics.totals.cancelled_revenue),
                })}
              />
              <Metric
                label={t("marketplaceAnalytics.metrics.cards")}
                value={`${analytics.totals.cards_with_sales} / ${analytics.cards_count}`}
                hint={t("marketplaceAnalytics.metrics.cardsHint")}
              />
            </div>
            <div className="border-t border-ui-border-base px-6 py-3">
              <Text className="text-ui-fg-muted" size="xsmall">
                {analytics.formulas.revenue}
              </Text>
            </div>
          </Container>

          <Container className="p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("marketplaceAnalytics.byDay.title")}</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceAnalytics.byDay.subtitle")}
              </Text>
            </div>
            <div className="px-6 pb-4">
              <SalesChart
                currency={analytics.seller_currency}
                days={analytics.by_day}
                locale={locale}
                measure="revenue"
              />
            </div>
            <div className="max-h-96 overflow-y-auto border-t border-ui-border-base px-6 py-2">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("marketplaceAnalytics.byDay.day")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.revenue")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.orders")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.units")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.cancelled")}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {analytics.by_day.map((day) => (
                    <Table.Row key={day.day}>
                      <Table.Cell>{formatDay(day.day, locale)}</Table.Cell>
                      <Table.Cell className="text-right">{money(day.revenue)}</Table.Cell>
                      <Table.Cell className="text-right">{day.orders}</Table.Cell>
                      <Table.Cell className="text-right">{day.units}</Table.Cell>
                      <Table.Cell className="text-right">
                        {day.cancelled_units > 0 ? `${day.cancelled_units} шт` : "—"}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </Container>

          <Container className="p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("marketplaceAnalytics.markets.title")}</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceAnalytics.markets.subtitle", {
                  currency: analytics.seller_currency ?? "—",
                })}
              </Text>
            </div>
            <div className="px-6 pb-4">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("marketplaceAnalytics.markets.market")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.revenue")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("marketplaceAnalytics.metrics.orders")}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {analytics.markets.map((market) => (
                    <Table.Row key={market.currency ?? "none"}>
                      <Table.Cell>{market.label}</Table.Cell>
                      <Table.Cell className="text-right">{money(market.revenue)}</Table.Cell>
                      <Table.Cell className="text-right">{market.orders}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </Container>

          <Container className="p-0">
            <div className="flex flex-wrap gap-8 px-6 py-4">
              <div className="flex flex-col gap-y-2">
                <Heading level="h2">{t("marketplaceAnalytics.abc.title")}</Heading>
                {analytics.abc.map((group) => (
                  <Text key={group.group ?? "none"} size="small">
                    <Badge size="2xsmall">{group.group ?? "—"}</Badge>{" "}
                    {t("marketplaceAnalytics.abc.row", {
                      cards: group.cards,
                      revenue: money(group.revenue),
                      share: group.revenue_share.toFixed(1),
                    })}
                  </Text>
                ))}
                <Text className="text-ui-fg-muted" size="xsmall">
                  {analytics.formulas.abc}
                </Text>
              </div>
              <div className="flex flex-col gap-y-2">
                <Heading level="h2">{t("marketplaceAnalytics.xyz.title")}</Heading>
                {analytics.xyz.map((group) => (
                  <Text key={group.group ?? "none"} size="small">
                    <Badge size="2xsmall">
                      {group.group ?? t("marketplaceAnalytics.xyz.noClass")}
                    </Badge>{" "}
                    {t("marketplaceAnalytics.xyz.row", {
                      cards: group.cards,
                      units: group.units,
                    })}
                  </Text>
                ))}
                <Text className="text-ui-fg-muted" size="xsmall">
                  {analytics.formulas.xyz}
                </Text>
              </div>
            </div>
          </Container>

          <Container className="p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("marketplaceAnalytics.turnover.title")}</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceAnalytics.turnover.subtitle", {
                  stock:
                    analytics.totals.stock_units === null
                      ? "—"
                      : new Intl.NumberFormat(locale).format(analytics.totals.stock_units),
                  days:
                    analytics.totals.stock_days_left === null
                      ? "—"
                      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
                          analytics.totals.stock_days_left
                        ),
                })}
              </Text>
              {/* Предупреждение считается по САМИМ числам остатка, а не написано
                  в код навсегда: пропадут повторы — пропадёт и оно. */}
              {analytics.stock_note ? (
                <Text className="text-ui-tag-orange-text mt-2" size="small">
                  {analytics.stock_note}
                </Text>
              ) : null}
              <Text className="text-ui-fg-muted mt-2" size="xsmall">
                {analytics.formulas.stock}
              </Text>
            </div>
            <div className="border-t border-ui-border-base px-6 py-4">
              <Text size="small" weight="plus">
                {t("marketplaceAnalytics.turnover.running")}
              </Text>
              {running.length === 0 ? (
                <Text className="text-ui-fg-subtle" size="small">
                  {t("marketplaceAnalytics.turnover.nothingRunningOut")}
                </Text>
              ) : (
                running.map((card) => (
                  <Text key={`${card.marketplace}-${card.card_id}`} size="small">
                    {t("marketplaceAnalytics.turnover.row", {
                      title: card.title ?? card.card_id ?? "—",
                      days: card.turnover.days_to_zero?.toFixed(1) ?? "—",
                      stock: card.turnover.stock ?? 0,
                      rate: card.turnover.rate_per_day.toFixed(2),
                    })}
                  </Text>
                ))
              )}
            </div>
          </Container>

          <Container className="p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("marketplaceAnalytics.cards.title")}</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaceAnalytics.cards.subtitle", {
                  shown: shownCards.length,
                  total: analytics.cards_count,
                })}
              </Text>
            </div>
            <div className="overflow-x-auto px-6 pb-4">
              <CardsTable
                cards={shownCards}
                currency={analytics.seller_currency}
                locale={locale}
                marketplaceLabels={marketplaceLabels}
              />
            </div>
            {more > 0 ? (
              <div className="border-t border-ui-border-base px-6 py-3">
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.set("limit", String(analytics.limit + DEFAULT_LIMIT))
                    setParams(next)
                  }}
                >
                  {t("marketplaceAnalytics.cards.more", { count: more })}
                </Button>
              </div>
            ) : null}
          </Container>
        </>
      )}

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("marketplaceAnalytics.rating.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceAnalytics.rating.subtitle")}
          </Text>
        </div>
        <div className="px-6 pb-2">
          {analytics.rating.map((source) => (
            <SourceBlock key={source.marketplace} locale={locale} source={source} />
          ))}
        </div>
      </Container>

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("marketplaceAnalytics.pnl.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceAnalytics.pnl.subtitle")}
          </Text>
        </div>
        <div className="px-6 pb-2">
          {analytics.pnl.map((source) => (
            <SourceBlock key={source.marketplace} locale={locale} source={source} />
          ))}
        </div>
        <div className="border-t border-ui-border-base px-6 py-3">
          <Text className="text-ui-fg-muted" size="xsmall">
            {t("marketplaceAnalytics.pnl.note")}
          </Text>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
