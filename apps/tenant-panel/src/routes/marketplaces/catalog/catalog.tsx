import { Alert, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  useAutoLinkMarketplaceCatalog,
  useMarketplaceCatalog,
  type CatalogState,
  type CatalogThresholds,
} from "../../../hooks/api/marketplace-catalog"
import { CatalogTable } from "./components/catalog-table"

/**
 * «Маркетплейсы → Каталог» — the shop's goods and their marketplace cards in
 * ONE list, keyed by the article (w14-mp-catalog-link, row 3 of the parity
 * matrix in research/marketplace-spec.md).
 *
 * THE FOUR TABS PARTITION THE ARTICLES, and the screen says so out loud: the
 * line under the tabs is the arithmetic, `2 + 0 + 423 + 34 = 459`, so a count
 * that stopped adding up is visible here and not only in a report nobody runs.
 *
 * THE ZERO IS NOT AN EMPTY SCREEN. When cards are stored and no link is, the
 * banner says «сопоставление не сработало: 0 из N» and names the absolute path
 * of the rule that decided it and the tables it read (rule 20a). An owner who
 * sees «нет данных» stops; an owner who sees a path and a table name can hand
 * both to us.
 *
 * Design system: @medusajs/ui, like every screen of this panel, which is a
 * copy of Medusa Admin 2.19. The divergence from the Geist canon is the one
 * recorded in w01 and w12 and repeated in this task's report.
 */

const TABS: Array<{ id: CatalogState; label: string }> = [
  { id: "linked", label: "связано" },
  { id: "not_found_in_shop", label: "не найдено в магазине" },
  { id: "missing_on_marketplace", label: "нет на площадке" },
  { id: "needs_choice", label: "требует выбора" },
]

const DEFAULTS: CatalogThresholds = { price_pct: 10, stock_abs: 1, photos_abs: 1 }

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

export const MarketplaceCatalog = () => {
  const [thresholds, setThresholds] = useState<CatalogThresholds>(DEFAULTS)
  const [tab, setTab] = useState<CatalogState>("linked")

  const { rows, counts, summary, sources, stored, isPending, isError, error } =
    useMarketplaceCatalog(thresholds)

  const { mutate: autoLink, isPending: isLinking } = useAutoLinkMarketplaceCatalog({
    onSuccess: (data) => {
      const written = data.marketplaces.reduce(
        (total, entry) => total + entry.created + entry.updated,
        0
      )
      const ambiguous = data.marketplaces.reduce((total, entry) => total + entry.needs_choice, 0)
      toast.success(
        `Связей записано: ${written}. Требует выбора (не связано): ${ambiguous}.`
      )
    },
    onError: (failure) => toast.error(failure.message),
  })

  const visible = useMemo(() => (rows ?? []).filter((row) => row.state === tab), [rows, tab])

  // After every hook: a throw here hands the failure to the route's own
  // ErrorBoundary, and a hook below it would change the hook order of the
  // render that throws.
  if (isError) {
    throw error
  }

  const arithmetic = counts
    ? `${counts.linked} + ${counts.not_found_in_shop} + ${counts.missing_on_marketplace} + ` +
      `${counts.needs_choice} = ${counts.accounted_for} из ${counts.total} артикулов`
    : null

  /**
   * The setup error, not the empty state. Cards stored and no link stored is a
   * different fact from "nothing has been imported yet", and the two must not
   * share a sentence.
   */
  const linkingFailed = Boolean(stored && stored.cards > 0 && stored.links === 0)

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div>
            <Heading>Каталог маркетплейсов</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              Один список: товары магазина и карточки площадок, сведённые по артикулу (артикул
              площадки = SKU товара).
            </Text>
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
            <ThresholdField
              id="photos_abs"
              label="Порог по фото"
              hint="фотографий"
              value={thresholds.photos_abs}
              onChange={(value) => setThresholds((prev) => ({ ...prev, photos_abs: value }))}
            />
            <Button size="small" disabled={isLinking} onClick={() => autoLink()}>
              Связать всё по артикулу
            </Button>
          </div>
        </div>

        {isPending || !counts ? (
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              Считаем артикулы…
            </Text>
          </div>
        ) : (
          <>
            {linkingFailed ? (
              <div className="px-6 py-4">
                <Alert variant="error">
                  <div className="flex flex-col gap-y-1">
                    <Text size="small" weight="plus">
                      {summary}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle break-all">
                      Правило сопоставления: {sources?.matcher}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Прочитано: карточек {stored?.cards}, строк цен и остатков {stored?.offers},
                      вариантов магазина {stored?.variants}, связей {stored?.links}.
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
                >
                  {entry.label} ({counts[entry.id]})
                </Button>
              ))}
            </div>

            <CatalogTable rows={visible} />
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
