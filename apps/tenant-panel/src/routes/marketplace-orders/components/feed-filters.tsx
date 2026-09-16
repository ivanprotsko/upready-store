import { Badge, Button, DatePicker, Label, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { FeedFacet } from "../../../hooks/api/marketplace-orders"

/**
 * The four filters of the order desk: площадка, схема, статус, период
 * (w15-mp-orders-desk).
 *
 * EVERY CHOICE GOES INTO THE URL. The screen holds no filter state of its own;
 * it reads the query string and writes the query string, so a view can be sent
 * to somebody and opened as it was left. That is also why the buttons are
 * toggles over a list the backend counted, rather than a select with a fixed
 * vocabulary: a status that no order of this shop has is not offered, and a
 * status the marketplace invented last week appears without a deploy.
 *
 * The counts next to each value are counted over the PERIOD and before the
 * other filters, so choosing «Wildberries» does not make Ozon vanish from its
 * own filter and leave the owner unable to switch back.
 */

type Props = {
  facets: { sources: FeedFacet[]; schemes: FeedFacet[]; statuses: FeedFacet[] }
  applied: { source: string[]; scheme: string[]; status: string[] }
  from: string
  to: string
  onToggle: (key: "source" | "scheme" | "status", value: string) => void
  onPeriod: (from: string | null, to: string | null) => void
  onReset: () => void
  hasAnyFilter: boolean
}

/**
 * `YYYY-MM-DD` <-> `Date`, both in the BROWSER's own timezone.
 *
 * Mixing the two directions is a loop, not a cosmetic bug: `new Date("2020-01-31")`
 * is midnight UTC, the picker hands back midnight LOCAL, and
 * `toISOString().slice(0, 10)` of that is the PREVIOUS day east of Greenwich.
 * The picker then re-renders with the new value, fires again, and the period
 * walks backwards one day per render — measured on the stand, where
 * `?to=2020-01-31` became `to=2020-01-28` while the screen sat on «Загрузка…»
 * because every rewrite started another query.
 *
 * So both halves use local calendar components and never `toISOString`.
 */
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

const asIsoDay = (value: Date | null): string | null => {
  if (!value || Number.isNaN(value.getTime())) {
    return null
  }
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${value.getFullYear()}-${month}-${day}`
}

const FilterRow = ({
  label,
  facets,
  applied,
  onToggle,
}: {
  label: string
  facets: FeedFacet[]
  applied: string[]
  onToggle: (value: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-2">
      <Label size="xsmall" weight="plus">
        {label}
      </Label>
      {facets.length === 0 ? (
        /* Пустая строка фильтра объясняет себя, а не притворяется загрузкой. */
        <Text className="text-ui-fg-muted" size="small">
          {t("marketplaceOrders.filters.nothingToFilter")}
        </Text>
      ) : (
        <div className="flex flex-wrap gap-2">
          {facets.map((facet) => {
            const active = applied.includes(facet.value)
            return (
              <button
                key={facet.value}
                type="button"
                onClick={() => onToggle(facet.value)}
                aria-pressed={active}
                data-testid={`filter-${facet.value}`}
                className="rounded-full focus-visible:shadow-borders-focus outline-none"
              >
                <Badge size="small" color={active ? "blue" : "grey"}>
                  {facet.label} · {facet.count}
                </Badge>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const FeedFilters = ({
  facets,
  applied,
  from,
  to,
  onToggle,
  onPeriod,
  onReset,
  hasAnyFilter,
}: Props) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <FilterRow
        label={t("marketplaceOrders.filters.source")}
        facets={facets.sources}
        applied={applied.source}
        onToggle={(value) => onToggle("source", value)}
      />
      <FilterRow
        label={t("marketplaceOrders.filters.scheme")}
        facets={facets.schemes}
        applied={applied.scheme}
        onToggle={(value) => onToggle("scheme", value)}
      />
      <FilterRow
        label={t("marketplaceOrders.filters.status")}
        facets={facets.statuses}
        applied={applied.status}
        onToggle={(value) => onToggle("status", value)}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-y-2">
          <Label size="xsmall" weight="plus">
            {t("marketplaceOrders.filters.from")}
          </Label>
          <DatePicker
            value={asDate(from)}
            /*
             * A picker that re-emits the value it was given must not rewrite the
             * URL: `onPeriod` is called only when the DAY actually changed.
             */
            onChange={(value) => {
              const next = asIsoDay(value)
              if (next !== (from || null)) {
                onPeriod(next, to || null)
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label size="xsmall" weight="plus">
            {t("marketplaceOrders.filters.to")}
          </Label>
          <DatePicker
            value={asDate(to)}
            onChange={(value) => {
              const next = asIsoDay(value)
              if (next !== (to || null)) {
                onPeriod(from || null, next)
              }
            }}
          />
        </div>
        {hasAnyFilter ? (
          <Button size="small" variant="secondary" onClick={onReset} data-testid="filters-reset">
            {t("marketplaceOrders.filters.reset")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
