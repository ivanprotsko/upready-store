"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Button, clx } from "@medusajs/ui"
import { Clock, MagnifyingGlass } from "@medusajs/icons"
import { useLocale, useTranslations } from "next-intl"

import { convertToLocale } from "@lib/util/money"
import {
  compactWorkTime,
  fetchPochtaCities,
  fetchPochtaPoints,
  fetchPochtaQuote,
  pochtaQuoteLabel,
  type PochtaCity,
  type PochtaQuote,
  type PochtaStorePoint,
} from "@lib/util/pochta"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import {
  FIELD_FOCUS_WITHIN,
  FIELD_SURFACE,
} from "@modules/common/components/input/field-classes"
import SuggestInput from "@modules/common/components/suggest-input"
import MapPin from "@modules/common/icons/map-pin"

/**
 * Leaflet reads `window` as soon as it is imported, so the map is a client-only
 * chunk: never rendered on the server, and not downloaded until the sheet
 * opens.
 */
const PochtaMap = dynamic(() => import("@modules/checkout/components/pochta-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-md bg-ui-bg-subtle" />,
})

export type PochtaPointSheetProps = {
  open: boolean
  onClose: () => void
  /** The city the buyer's address already names; the sheet starts there. */
  initialCity: string
  /** Index of the point already on the cart, highlighted in the list. */
  selectedIndex: string | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: PochtaStorePoint) => Promise<string | null>
  currencyCode: string
}

/**
 * The Russian Post pickup-point picker: a city search, a map and a list
 * (46df-pochta).
 *
 * Built on the CDEK sheet's controls (the modal, the city suggest, the rows,
 * the Choose button) so a buyer who meets both meets one picker, and it reuses
 * that sheet's carrier-neutral strings. Two differences: the map sits ABOVE
 * the list on a narrow screen instead of behind a tab, and a point shows its
 * own price and term before it is chosen, because a Russian Post price depends
 * on the point's region.
 */
export default function CheckoutPochtaPointSheet({
  open,
  onClose,
  initialCity,
  selectedIndex,
  onChoose,
  currencyCode,
}: PochtaPointSheetProps) {
  const t = useTranslations("PochtaPoint")
  const tPoint = useTranslations("CdekPoint")
  const locale = useLocale()

  const [city, setCity] = useState(initialCity)
  const [region, setRegion] = useState<string | null>(null)
  const [points, setPoints] = useState<PochtaStorePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [query, setQuery] = useState("")
  const [previewIndex, setPreviewIndex] = useState<string | null>(null)
  const [quote, setQuote] = useState<PochtaQuote | null>(null)
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "failed">("idle")
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestRef = useRef(0)
  const rowsRef = useRef<Record<string, HTMLLIElement | null>>({})

  useEffect(() => {
    if (!open) {
      setQuery("")
      setError(null)
      setPreviewIndex(null)
      return
    }
    setCity(initialCity)
    setRegion(null)
  }, [open, initialCity])

  useEffect(() => {
    if (!open) return
    const term = city.trim()
    if (!term) {
      setPoints([])
      setLoading(false)
      return
    }
    const ticket = ++requestRef.current
    setLoading(true)
    const timer = setTimeout(() => {
      fetchPochtaPoints({ city: term, region })
        .then((answer) => {
          if (ticket !== requestRef.current) return
          setConfigured(answer.configured)
          setPoints(answer.points ?? [])
          setPreviewIndex(null)
        })
        .finally(() => {
          if (ticket === requestRef.current) setLoading(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [open, city, region])

  const trimmedQuery = query.trim()
  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return points
    return points.filter((point) =>
      [point.name, point.address, point.index, point.directions]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [points, trimmedQuery])

  const preview = useMemo(
    () => filtered.find((point) => point.index === previewIndex) ?? null,
    [filtered, previewIndex]
  )

  // The price of the previewed point. An answer for a point the buyer has
  // already moved on from is aborted, never shown against the wrong card.
  useEffect(() => {
    if (!preview) {
      setQuote(null)
      setQuoteState("idle")
      return
    }
    const controller = new AbortController()
    setQuote(null)
    setQuoteState("loading")
    fetchPochtaQuote({ index: preview.index, kind: preview.kind }, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return
        setQuote(answer.quote)
        setQuoteState(answer.quote ? "idle" : "failed")
      }
    )
    return () => controller.abort()
  }, [preview])

  const choose = async (point: PochtaStorePoint) => {
    setChoosing(true)
    setError(null)
    const message = await onChoose(point)
    setChoosing(false)
    if (message) {
      setError(message)
      return
    }
    onClose()
  }

  const selectPoint = (point: PochtaStorePoint) => {
    setPreviewIndex(point.index)
    rowsRef.current[point.index]?.scrollIntoView({ block: "nearest" })
  }

  const priceLabel = (amount: number) =>
    convertToLocale({ amount, currency_code: currencyCode, locale })

  const cityChosen = Boolean(city.trim())

  const pointRows = (
    <ul
      className="flex max-h-[40vh] flex-col overflow-y-auto small:h-full small:max-h-none"
      data-testid="pochta-point-list"
    >
      {filtered.map((point) => {
        const isChosen = point.index === selectedIndex
        const isPreview = point.index === previewIndex
        return (
          <li
            key={point.index}
            ref={(el) => {
              rowsRef.current[point.index] = el
            }}
            className={clx(
              "flex cursor-pointer flex-col gap-y-0.5 border-t border-ui-border-base py-3 first:border-t-0",
              (isChosen || isPreview) && "-mx-2 rounded-md bg-ui-bg-subtle px-2"
            )}
            onClick={() => selectPoint(point)}
            data-testid="pochta-point-row"
            data-point-index={point.index}
          >
            <span className="txt-compact-medium-plus text-ui-fg-base">{point.address}</span>
            <span className="txt-compact-small text-ui-fg-subtle flex items-start gap-x-1.5">
              <MapPin size={14} />
              <span>
                {point.name} · {t("postcode", { index: point.index })}
              </span>
            </span>
            {point.work_time.length > 0 && (
              <span className="txt-compact-small text-ui-fg-subtle flex items-center gap-x-1.5">
                <Clock className="shrink-0" />
                <span>{compactWorkTime(point.work_time)}</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <CheckoutModal open={open} onClose={onClose} title={t("chooseHeading")} fullscreen>
      <div className="flex flex-col gap-y-4 small:h-full small:min-h-0" data-testid="pochta-point-sheet">
        <SuggestInput<PochtaCity>
          label={tPoint("cityLabel")}
          value={city}
          onValueChange={(text) => {
            setCity(text)
            setRegion(null)
          }}
          onPick={(picked) => {
            setCity(picked.name)
            setRegion(picked.region)
          }}
          fetchItems={fetchPochtaCities}
          itemKey={(item) => `${item.name}|${item.region ?? ""}`}
          itemLabel={(item) => item.name}
          itemHint={(item) => item.region}
          autoComplete="address-level2"
          testId="pochta-point-city"
        />

        <div className={clx("flex items-center gap-x-2 px-3", FIELD_SURFACE, FIELD_FOCUS_WITHIN)}>
          <MagnifyingGlass className="shrink-0 text-ui-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tPoint("searchPlaceholder")}
            // theme-colours allowlist: no ring of its own, the search box around it rings on focus-within (FIELD_FOCUS_WITHIN).
            className="h-10 w-full bg-transparent txt-compact-medium text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
            data-testid="pochta-point-search"
          />
        </div>

        {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}

        {!configured ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center">{t("notConfigured")}</p>
        ) : !cityChosen ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center">{tPoint("needCity")}</p>
        ) : loading ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center" data-testid="pochta-point-loading">
            {tPoint("loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center" data-testid="pochta-point-empty">
            {tPoint("noResults", { city: city.trim() })}
          </p>
        ) : (
          <div className="flex flex-col gap-y-3 small:min-h-0 small:flex-1">
            <p className="txt-compact-xsmall text-ui-fg-muted" data-testid="pochta-point-count">
              {tPoint("found", { count: filtered.length })}
            </p>

            {preview && (
              <div
                className="flex flex-col gap-y-1 rounded-md border border-ui-border-interactive p-3"
                data-testid="pochta-point-card"
              >
                <span className="txt-compact-medium-plus text-ui-fg-base">{preview.address}</span>
                <span className="txt-compact-small text-ui-fg-subtle">
                  {preview.name} · {t("postcode", { index: preview.index })}
                </span>
                {preview.work_time.length > 0 && (
                  <span className="txt-compact-small text-ui-fg-subtle">
                    {compactWorkTime(preview.work_time)}
                  </span>
                )}
                {preview.directions && (
                  <span className="txt-compact-small text-ui-fg-muted">{preview.directions}</span>
                )}
                <span className="txt-compact-medium-plus text-ui-fg-base mt-1" data-testid="pochta-point-quote">
                  {quoteState === "loading"
                    ? "…"
                    : quote
                      ? pochtaQuoteLabel(quote, priceLabel)
                      : null}
                </span>
                {quoteState === "failed" && (
                  <span className="txt-compact-small text-ui-fg-error">{t("quoteFailed")}</span>
                )}
                <Button
                  variant={preview.index === selectedIndex ? "secondary" : "primary"}
                  size="small"
                  className="mt-2 w-fit"
                  isLoading={choosing}
                  disabled={choosing || quoteState !== "idle" || !quote}
                  onClick={() => choose(preview)}
                  data-testid="pochta-point-choose"
                >
                  {preview.index === selectedIndex ? tPoint("chosen") : tPoint("choose")}
                </Button>
              </div>
            )}

            {/* On a narrow screen the map comes first and the list under it;
                from `small` up they stand side by side, list on the left. Ivan's
                item 9б: the list a third, the map two thirds, both down to the
                bottom of the full-screen window. */}
            <div className="grid gap-3 small:min-h-0 small:flex-1 small:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] small:grid-rows-[minmax(0,1fr)]">
              <div className="min-w-0 small:min-h-0">{pointRows}</div>
              <div className="order-first min-w-0 small:order-none small:min-h-0">
                <PochtaMap
                  points={filtered}
                  selectedIndex={previewIndex ?? selectedIndex}
                  onSelect={selectPoint}
                  className="h-[260px] w-full rounded-md border border-ui-border-base small:h-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </CheckoutModal>
  )
}
