import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { SingleColumnPage } from "../../components/layout/pages"
import { useMarketplaceOrder } from "../../hooks/api/marketplace-orders"

/**
 * The card of ONE marketplace order (w15-mp-orders-desk).
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
 */

const dash = "—"

const formatDate = (value: string | null, locale: string) =>
  value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value)
      )
    : dash

const formatMoney = (total: number | null, currency: string | null, locale: string) => {
  if (total === null) {
    return dash
  }
  if (!currency) {
    return new Intl.NumberFormat(locale).format(total)
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(total)
  } catch {
    return `${new Intl.NumberFormat(locale).format(total)} ${currency}`
  }
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-y-1 px-6 py-3">
    <Text className="text-ui-fg-subtle" size="xsmall" weight="plus">
      {label}
    </Text>
    <Text size="small">{children}</Text>
  </div>
)

export const MarketplaceOrderDetail = () => {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { detail, isPending, isError, error } = useMarketplaceOrder(id!)

  if (isError) {
    throw error
  }

  const locale = i18n.language || "ru"

  if (isPending || !detail) {
    return (
      <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaceOrders.loading")}
            </Text>
          </div>
        </Container>
      </SingleColumnPage>
    )
  }

  const { order, lines, status_history: history } = detail

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div>
            <Heading data-testid="order-number">
              {order.source_label} · {order.number}
            </Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaceOrders.detail.readOnly")}
            </Text>
          </div>
          <Badge size="small" color={order.is_cancelled ? "red" : "grey"}>
            {order.status_label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 border-t md:grid-cols-3">
          <Field label={t("marketplaceOrders.columns.date")}>
            {formatDate(order.ordered_at, locale)}
          </Field>
          <Field label={t("marketplaceOrders.columns.scheme")}>{order.scheme ?? dash}</Field>
          <Field label={t("marketplaceOrders.detail.statusRaw")}>
            {/* Слово площадки целиком: и статус продавца, и статус площадки. */}
            {order.status_raw ?? dash}
            {order.status_detail ? ` · ${order.status_detail}` : ""}
          </Field>
          <Field label={t("marketplaceOrders.columns.region")}>{order.buyer_region ?? dash}</Field>
          <Field label={t("marketplaceOrders.detail.warehouse")}>
            {order.warehouse_name ?? dash}
          </Field>
          <Field label={t("marketplaceOrders.columns.total")}>
            {formatMoney(order.total, order.currency, locale)}
          </Field>
          <Field label={t("marketplaceOrders.detail.statusChangedAt")}>
            {order.status_changed_at
              ? formatDate(order.status_changed_at, locale)
              : t("marketplaceOrders.detail.statusChangedUnknown")}
          </Field>
          <Field label={t("marketplaceOrders.detail.syncedAt")}>
            {formatDate(order.synced_at, locale)}
          </Field>
        </div>
      </Container>

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("marketplaceOrders.detail.lines")}</Heading>
        </div>
        {lines.length === 0 ? (
          <div className="px-6 pb-6">
            {/* Ноль строк — это дефект импорта, а не «пустой заказ» (правило 20a). */}
            <Text className="text-ui-fg-error" size="small">
              {t("marketplaceOrders.detail.noLines")}
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("marketplaceOrders.detail.vendorCode")}</Table.HeaderCell>
                <Table.HeaderCell>{t("marketplaceOrders.detail.product")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  {t("marketplaceOrders.detail.qty")}
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  {t("marketplaceOrders.columns.total")}
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {lines.map((line) => (
                <Table.Row key={line.id} data-testid="order-line">
                  <Table.Cell>{line.vendor_code ?? dash}</Table.Cell>
                  <Table.Cell>
                    {line.product ? (
                      <Link className="text-ui-fg-interactive" to={`/products/${line.product.id}`}>
                        {line.product.title ?? line.product.id}
                      </Link>
                    ) : (
                      /* Артикул виден, чтобы владелица знала, КАКОГО товара нет. */
                      <Text className="text-ui-fg-muted" size="small" data-testid="line-unlinked">
                        {t("marketplaceOrders.detail.notInShop")}
                        {line.marketplace_title ? ` · ${line.marketplace_title}` : ""}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">{line.qty ?? dash}</Table.Cell>
                  <Table.Cell className="text-right">
                    {formatMoney(line.price, order.currency, locale)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("marketplaceOrders.detail.history")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaceOrders.detail.historyHint")}
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("marketplaceOrders.detail.observedAt")}</Table.HeaderCell>
              <Table.HeaderCell>{t("marketplaceOrders.detail.statusRaw")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {history.map((event) => (
              <Table.Row key={`${event.observed_at}-${event.status}`} data-testid="history-row">
                <Table.Cell>{formatDate(event.observed_at, locale)}</Table.Cell>
                <Table.Cell>
                  {event.status ?? dash}
                  {event.status_detail ? ` · ${event.status_detail}` : ""}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>
    </SingleColumnPage>
  )
}
