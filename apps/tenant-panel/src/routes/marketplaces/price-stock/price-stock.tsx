import { Alert, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useCallback, useState } from "react"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  marketplacePriceStockExportPath,
  useMarketplacePriceStock,
  type PriceStockTab,
  type PriceStockThresholds,
} from "../../../hooks/api/marketplace-price-stock"
import { sdk } from "../../../lib/client"
import { PriceStockTable } from "./components/price-stock-table"

/**
 * «Маркетплейсы → Цены и остатки» — the shop's prices and stocks next to every
 * marketplace's, in ONE table (w17-mp-price-stock-table, row 4 of the parity
 * matrix in `research/marketplace-spec.md`).
 *
 * READ ONLY, and it is the point rather than a limitation. InSales Combo
 * advertises editing every marketplace's price in one table; we show the same
 * table and point at the differences, because writing to WB and Ozon is phase
 * 4 and the keys this shop has are read-only. There is no input, no bulk
 * action and no «отправить на площадку» on this screen, and
 * `price-stock-read-only.unit.spec.ts` fails the suite if one appears.
 *
 * THE THREE GROUPS PARTITION THE ARTICLES and the screen says so out loud: the
 * line under the tabs is the arithmetic, so a count that stopped adding up is
 * visible here and not only in a report nobody runs. «Расхождение выше порога»
 * is the fourth TAB and an OVERLAY on those three — every row in it is already
 * counted in «везде есть» — which is why it stands outside the sum.
 *
 * THE ZERO IS NOT AN EMPTY SCREEN (rule 20a): cards stored with no price and
 * stock lines is a different fact from «ничего не импортировали», and the
 * banner names the tables that were read.
 *
 * Design system: @medusajs/ui, like every screen of this panel, which is a
 * copy of Medusa Admin 2.19. The divergence from the Geist canon is the one
 * recorded in w01, w12 and w14 and repeated in this task's report.
 */

const TABS: Array<{ id: PriceStockTab; label: string }> = [
  { id: "both", label: "везде есть" },
  { id: "shop_only", label: "есть в магазине, нет на площадке" },
  { id: "marketplace_only", label: "есть на площадке, нет в магазине" },
  { id: "over_threshold", label: "расхождение выше порога" },
]

const DEFAULTS: PriceStockThresholds = { price_pct: 10, stock_abs: 1 }

const ThresholdField = ({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) => (
  <div className="flex flex-col gap-y-1">
    <Label htmlFor={id} size="xsmall" weight="plus">
      {label}
    </Label>
    <Input
      id={id}
      className="w-28"
      type="number"
      min={0}
      value={String(value)}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        // A threshold read as NaN would highlight nothing and look like «нет
        // расхождений» (rule 20a), so a non-number never reaches the query.
        if (Number.isFinite(parsed) && parsed >= 0) {
          onChange(parsed)
        }
      }}
    />
    <Text size="xsmall" className="text-ui-fg-subtle">
      {hint}
    </Text>
  </div>
)

export const MarketplacePriceStock = () => {
  const [thresholds, setThresholds] = useState<PriceStockThresholds>(DEFAULTS)
  const [tab, setTab] = useState<PriceStockTab>("both")

  const query = { ...thresholds, tab }
  const {
    rows,
    counts,
    summary,
    marketplaces,
    marketplaceLabels,
    stored,
    sources,
    isPending,
    isError,
    error,
  } = useMarketplacePriceStock(query)

  /**
   * The export is fetched through the SDK rather than opened as a link,
   * because the panel authenticates with a bearer token the browser would not
   * attach to a plain navigation, and `accept: text/csv` is what makes the SDK
   * hand back the raw `Response` instead of parsing the body as JSON
   * (`@medusajs/js-sdk` 2.19 — the lesson `marketplace-orders` records).
   *
   * The SAME query string the table was built from, so the file IS the table.
   */
  const download = useCallback(async () => {
    try {
      const response = await sdk.client.fetch<Response>(
        // Rebuilt from the primitives rather than closed over `query`: that
        // object is new on every render, so depending on it would rebuild this
        // callback on every render too.
        marketplacePriceStockExportPath({ ...thresholds, tab }),
        { headers: { accept: "text/csv" } }
      )
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `price-stock-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Файл не выгрузился")
    }
  }, [thresholds, tab])

  // After every hook: a throw here hands the failure to the route's own
  // ErrorBoundary, and a hook below it would change the hook order of the
  // render that throws.
  if (isError) {
    throw error
  }

  const arithmetic = counts
    ? `${counts.both} + ${counts.shop_only} + ${counts.marketplace_only} = ` +
      `${counts.accounted_for} из ${counts.total} артикулов` +
      ` · выше порога ${counts.over_threshold} (это те же строки из «везде есть»)`
    : null

  /** Cards stored and no price/stock line stored is a setup error, not an empty shop. */
  const importEmpty = Boolean(stored && stored.cards > 0 && stored.lines === 0)

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div className="flex items-start justify-between gap-x-4">
            <div>
              <Heading>Цены и остатки</Heading>
              <Text className="text-ui-fg-subtle" size="small">
                Одна таблица: цена и остаток в магазине рядом с ценой и остатком на каждой площадке,
                сведённые по артикулу. Только чтение — цены и остатки площадок отсюда не меняются.
              </Text>
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={download}
              disabled={!rows || rows.length === 0}
              data-testid="export-csv"
            >
              Скачать CSV ({rows?.length ?? 0} строк)
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <ThresholdField
              id="price_pct"
              label="Порог по цене"
              hint="% от цены площадки"
              value={thresholds.price_pct}
              onChange={(value) => setThresholds((prev) => ({ ...prev, price_pct: value }))}
            />
            <ThresholdField
              id="stock_abs"
              label="Порог по остатку"
              hint="штук"
              value={thresholds.stock_abs}
              onChange={(value) => setThresholds((prev) => ({ ...prev, stock_abs: value }))}
            />
            <Text size="xsmall" className="text-ui-fg-subtle max-w-md">
              Подсвечиваем строку, когда цена расходится на {thresholds.price_pct} % и больше или
              остаток — на {thresholds.stock_abs} шт и больше. Числа старше трёх интервалов загрузки
              (цены — 3 ч, остатки — 45 мин) помечаем «протухло».
            </Text>
          </div>
        </div>

        {isPending || !counts || !marketplaces ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              Считаем цены и остатки…
            </Text>
          </div>
        ) : (
          <>
            {importEmpty ? (
              <div className="px-6 py-4">
                <Alert variant="error">
                  <div className="flex flex-col gap-y-1">
                    <Text size="small" weight="plus">
                      {summary}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Прочитано: {sources?.cards}; {sources?.lines}; {sources?.variants};{" "}
                      {sources?.imports}.
                    </Text>
                  </div>
                </Alert>
              </div>
            ) : (
              <div className="px-6 py-3">
                <Text size="small">{summary}</Text>
                <Text size="xsmall" className="text-ui-fg-subtle tabular-nums">
                  Сходимость вкладок: {arithmetic}
                </Text>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-6 py-3">
              {TABS.map((entry) => (
                <Button
                  key={entry.id}
                  size="small"
                  variant={tab === entry.id ? "primary" : "secondary"}
                  onClick={() => setTab(entry.id)}
                  data-testid={`tab-${entry.id}`}
                >
                  {entry.label} ({counts[entry.id === "over_threshold" ? "over_threshold" : entry.id]})
                </Button>
              ))}
            </div>

            <PriceStockTable
              rows={rows ?? []}
              marketplaces={marketplaces}
              labels={marketplaceLabels ?? {}}
            />
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
