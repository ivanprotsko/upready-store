"use client"

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { IconButton, clx } from "@medusajs/ui"
import { MagnifyingGlass, XMark } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import CheckoutPickupMap from "@modules/checkout/components/checkout-pickup-map"
import {
  FIELD_FOCUS_WITHIN,
  FIELD_SURFACE,
} from "@modules/common/components/input/field-classes"

import {
  PointDetails,
  PointRow,
  PointSummary,
  type PickupPrice,
  type PickupRow,
} from "./point-row"
import { initialSelection, scrollTopFor, selectionReducer, type PickerTab } from "./selection"

export type { PickupRow, PickupRowLine } from "./point-row"

export type PickupPointPickerProps<P> = {
  open: boolean
  onClose: () => void
  /** The prefix of every test id, kept from the two sheets this picker replaced. */
  testIdPrefix: "pochta-point" | "cdek-point"
  /** The carrier's own city suggest: each carrier keeps its own directory. */
  cityField: ReactNode
  /** A line in place of the list while there is nothing to list: no city, loading, not configured. */
  notice: { text: string; testId?: string } | null
  points: P[]
  /** The carrier's point as the picker draws it (`rows.ts` next to each sheet). */
  rowOf: (point: P) => PickupRow
  /** Shown in place of the list when the search matched nothing. */
  noResultsText: string
  /** The point already on the cart, preselected on open (decision D9). */
  chosenId: string | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: P) => Promise<string | null>
  /** Russian Post: each point has its own price, fetched when it is selected; null = failed. */
  quoteOf?: (point: P, signal: AbortSignal) => Promise<string | null>
  quoteFailedText?: string
  /** CDEK: the method's one price · term, the same for every point. */
  methodPrice?: string | null
}

/**
 * One pickup-point picker for Russian Post and CDEK (t-2026-10-12-03, Ivan's items 1–3.8 of
 * 12.10, decision D2): a buyer meets one control whichever carrier delivers. Each carrier
 * keeps its own data fetch, its own row fields (`rowOf`) and its own choose call; everything
 * a buyer touches lives here.
 *
 * - From `small` up it is a large centred dialog with margins all round (item 1): the list
 *   takes the left third and the map the right two thirds, both down to the dialog's bottom.
 *   A tap on the map scrolls the list to that point and expands its row; no card appears on
 *   the map there (3.6.2).
 * - Below `small` it takes the whole screen. The head, the tabs «Список» / «Карта» and the
 *   city and search fields stay put while the list scrolls under them (3.1, 3.2).
 * - The title is «Выберите пункт выдачи» for both carriers (3.3); there is no «Найдено
 *   пунктов выдачи: N» line (3.7).
 * - A tap on a row selects it and expands it in place with the details and «Выбрать»; there
 *   is no separate card above the list (3.4). Rows run edge to edge (3.5).
 * - On the phone's «Карта» tab a tap on a point opens a card at the bottom of the map with
 *   «Выбрать» and an xmark; the xmark closes the card and clears the selection (3.6). Back on
 *   «Список» the list is already scrolled to the selected row (3.6.1).
 * - The selected point is a red Location pin on the map (3.8, `checkout-pickup-map`).
 * - Without a map key, or when the map fails to load, the picker is its list alone.
 */
export default function PickupPointPicker<P>({
  open,
  onClose,
  testIdPrefix,
  cityField,
  notice,
  points,
  rowOf,
  noResultsText,
  chosenId,
  onChoose,
  quoteOf,
  quoteFailedText,
  methodPrice,
}: PickupPointPickerProps<P>) {
  const t = useTranslations("CdekPoint")
  const prefix = testIdPrefix

  const [selection, dispatch] = useReducer(selectionReducer, initialSelection)
  const [query, setQuery] = useState("")
  const [choosingId, setChoosingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [quote, setQuote] = useState<{ id: string; label: string | null; done: boolean } | null>(
    null
  )

  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({})

  /** The key is baked in at build time; a build without it never shows a map. */
  const mapAvailable = Boolean(process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY) && !mapFailed

  // The carrier hands a fresh `rowOf` on every render; the rows depend on the points only.
  const rowOfRef = useRef(rowOf)
  rowOfRef.current = rowOf
  const rows = useMemo(
    () => points.map((point) => ({ point, row: rowOfRef.current(point) })),
    [points]
  )

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (needle ? rows.filter(({ row }) => row.searchText.toLowerCase().includes(needle)) : rows),
    [rows, needle]
  )

  /**
   * The map draws what the list shows. Filtering to one point and leaving the
   * map on all of them would be two answers to one question.
   */
  const mapPoints = useMemo(
    () =>
      filtered.map(({ row }) => ({
        id: row.id,
        lat: row.lat,
        lng: row.lng,
        kind: row.kind,
        hint: row.title,
      })),
    [filtered]
  )

  const selected = useMemo(
    () => filtered.find(({ row }) => row.id === selection.selectedId) ?? null,
    [filtered, selection.selectedId]
  )

  useEffect(() => {
    if (open) return
    setQuery("")
    setError(null)
    dispatch({ type: "reset" })
  }, [open])

  // A new list of points: the cart's own point, when it is among them, is selected.
  const chosenRef = useRef(chosenId)
  chosenRef.current = chosenId
  useEffect(() => {
    dispatch({ type: "loaded", ids: rows.map(({ row }) => row.id), chosenId: chosenRef.current })
  }, [rows])

  // An error belongs to the point it was raised for.
  useEffect(() => {
    setError(null)
  }, [selection.selectedId])

  // The price of the selected point. An answer for a point the buyer has already
  // moved on from is aborted, never shown against the wrong row.
  const quoteRef = useRef(quoteOf)
  quoteRef.current = quoteOf
  const selectedPoint = selected?.point ?? null
  const selectedId = selected?.row.id ?? null
  useEffect(() => {
    const fetchQuote = quoteRef.current
    if (!fetchQuote || !selectedPoint || !selectedId) {
      setQuote(null)
      return
    }
    const controller = new AbortController()
    setQuote({ id: selectedId, label: null, done: false })
    fetchQuote(selectedPoint, controller.signal).then((label) => {
      if (controller.signal.aborted) return
      setQuote({ id: selectedId, label, done: true })
    })
    return () => controller.abort()
  }, [selectedPoint, selectedId])

  const price: PickupPrice = !quoteOf
    ? { label: methodPrice ?? null, loading: false, failed: null }
    : !quote || quote.id !== selectedId || !quote.done
      ? { label: null, loading: true, failed: null }
      : quote.label
        ? { label: quote.label, loading: false, failed: null }
        : { label: null, loading: false, failed: quoteFailedText ?? null }

  // The list brings the selected row into view when asked to: a tap on the map, a switch
  // back to «Список», the cart's point found on open. A hidden list (the phone's «Карта»
  // tab) has no height and waits for the switch back.
  const listShown = !notice && filtered.length > 0
  useLayoutEffect(() => {
    const list = listRef.current
    const id = selection.selectedId
    if (!list || !id || list.clientHeight === 0) return
    const row = rowRefs.current[id]
    if (!row) return
    list.scrollTop = scrollTopFor(list, row, selection.scrollMode)
  }, [selection.scrollRequest, selection.selectedId, selection.scrollMode, listShown])

  const choose = async (point: P, id: string) => {
    setChoosingId(id)
    setError(null)
    const message = await onChoose(point)
    setChoosingId(null)
    if (message) {
      setError(message)
      return
    }
    onClose()
  }

  const details = (entry: { point: P; row: PickupRow }, place: "row" | "map-card") => (
    <PointDetails
      row={entry.row}
      price={price}
      chosen={entry.row.id === chosenId}
      choosing={choosingId === entry.row.id}
      error={error}
      chooseLabel={t("choose")}
      chosenLabel={t("chosen")}
      onChoose={() => choose(entry.point, entry.row.id)}
      testIdPrefix={prefix}
      place={place}
    />
  )

  const tabs: PickerTab[] = ["list", "map"]
  const showMapTab = mapAvailable && selection.tab === "map"

  return (
    <CheckoutModal
      open={open}
      onClose={onClose}
      title={t("pickerHeading")}
      picker={mapAvailable ? "split" : "list"}
    >
      <div
        className={clx(
          "grid min-h-0 flex-1",
          mapAvailable
            ? "grid-rows-[auto_auto_minmax(0,1fr)] small:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] small:grid-rows-[auto_minmax(0,1fr)]"
            : "grid-rows-[auto_minmax(0,1fr)]"
        )}
        data-testid={`${prefix}-sheet`}
      >
        {/* The tabs exist on narrow screens only: from `small` up both panes stand side by
            side and switching would hide half the answer. */}
        {mapAvailable && (
          <div
            role="tablist"
            className="col-start-1 row-start-1 flex border-b border-ui-border-base px-4 small:hidden"
          >
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selection.tab === tab}
                onClick={() => dispatch({ type: "tab", tab })}
                className={clx(
                  "-mb-px h-11 flex-1 border-b-2 txt-compact-small-plus transition-fg",
                  selection.tab === tab
                    ? "border-ui-fg-base text-ui-fg-base"
                    : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
                )}
                data-testid={`${prefix}-tab-${tab}`}
              >
                {tab === "list" ? t("tabList") : t("tabMap")}
              </button>
            ))}
          </div>
        )}

        <div
          className={clx(
            "col-start-1 flex flex-col gap-y-2 border-b border-ui-border-base px-4 py-3 small:px-6",
            mapAvailable ? "row-start-2 small:row-start-1" : "row-start-1"
          )}
        >
          {cityField}
          <div className={clx("flex items-center gap-x-2 px-3", FIELD_SURFACE, FIELD_FOCUS_WITHIN)}>
            <MagnifyingGlass className="shrink-0 text-ui-fg-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              // theme-colours allowlist: no ring of its own, the search box around it rings on focus-within (FIELD_FOCUS_WITHIN).
              className="h-10 w-full bg-transparent txt-compact-medium text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
              data-testid={`${prefix}-search`}
            />
          </div>
        </div>

        <div
          className={clx(
            "col-start-1 min-h-0",
            mapAvailable ? "row-start-3 small:row-start-2" : "row-start-2",
            showMapTab && "hidden small:block"
          )}
        >
          {notice ? (
            <p
              className="txt-compact-small text-ui-fg-subtle px-4 py-6 text-center small:px-6"
              data-testid={notice.testId}
            >
              {notice.text}
            </p>
          ) : filtered.length === 0 ? (
            <p
              className="txt-compact-small text-ui-fg-subtle px-4 py-6 text-center small:px-6"
              data-testid={`${prefix}-empty`}
            >
              {noResultsText}
            </p>
          ) : (
            <ul
              ref={listRef}
              className="relative h-full overflow-y-auto overscroll-contain"
              data-testid={`${prefix}-list`}
            >
              {filtered.map((entry) => {
                const isSelected = entry.row.id === selection.selectedId
                return (
                  <PointRow
                    key={entry.row.id}
                    row={entry.row}
                    selected={isSelected}
                    onSelect={() => dispatch({ type: "row", id: entry.row.id })}
                    testIdPrefix={prefix}
                    rowRef={(el) => {
                      rowRefs.current[entry.row.id] = el
                    }}
                  >
                    {isSelected ? details(entry, "row") : null}
                  </PointRow>
                )
              })}
            </ul>
          )}
        </div>

        {mapAvailable && (
          <div
            className={clx(
              "relative col-start-1 row-start-3 min-h-0 small:col-start-2 small:row-start-1 small:row-end-3 small:block small:border-s small:border-ui-border-base",
              !showMapTab && "hidden"
            )}
          >
            <CheckoutPickupMap
              points={mapPoints}
              selectedId={selectedId}
              onSelect={(id) => dispatch({ type: "map", id })}
              onFailed={() => setMapFailed(true)}
              className="h-full w-full"
              emptyHint={t("mapEmpty")}
            />

            {/* The phone's map card (3.6). From `small` up the list next to the map shows
                the same point expanded, so the map gets no card (3.6.2). */}
            {selected && (
              <div
                className="absolute inset-x-0 bottom-0 p-3 small:hidden"
                data-testid={`${prefix}-map-card`}
              >
                <div className="flex flex-col gap-y-0.5 rounded-xl bg-ui-bg-base p-4 shadow-elevation-flyout">
                  <div className="flex items-start gap-x-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-y-0.5">
                      <PointSummary row={selected.row} />
                    </div>
                    <IconButton
                      variant="transparent"
                      size="small"
                      aria-label={t("closeCard")}
                      onClick={() => dispatch({ type: "clear" })}
                      data-testid={`${prefix}-map-card-close`}
                    >
                      <XMark />
                    </IconButton>
                  </div>
                  {details(selected, "map-card")}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </CheckoutModal>
  )
}
