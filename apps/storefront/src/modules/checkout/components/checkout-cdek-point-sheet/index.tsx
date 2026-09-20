"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button, clx } from "@medusajs/ui"
import { Clock, MagnifyingGlass } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import {
  fetchCdekCities,
  fetchCdekPoints,
  type CdekCity,
  type CdekStorePoint,
} from "@lib/util/cdek"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import CheckoutPickupMap from "@modules/checkout/components/checkout-pickup-map"
import SuggestInput from "@modules/common/components/suggest-input"
import MapPin from "@modules/common/icons/map-pin"

export type CdekPointSheetProps = {
  open: boolean
  onClose: () => void
  /** The city the buyer's address already names; the sheet starts there. */
  initialCity: string
  /** `POSTAMAT` when the chosen method is the locker one. */
  pointType: "PVZ" | "POSTAMAT"
  /** Code of the point already on the cart, highlighted in the list. */
  selectedCode: string | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: CdekStorePoint) => Promise<string | null>
  /** The method's price, already formatted by the section that knows the currency. */
  priceLabel?: string | null
  /** The method's delivery term, as the carrier worded it. */
  termLabel?: string | null
}

/**
 * The CDEK pickup-point picker: a list, a map and a city suggest
 * (i02-apiship-cdek-shipping, map and suggest added by
 * i03-checkout-pvz-map-address-suggest).
 *
 * A separate sheet from `checkout-pickup-point-sheet`, which lists the shop's
 * OWN pickup locations: those are one shipping option each and already on the
 * page, while CDEK's are thousands of a carrier's offices behind one option and
 * have to be fetched per city. Everything they share visually (the modal, the
 * search row, the result rows, the Choose button) is copied from that sheet
 * deliberately, so a buyer who meets both meets one control. This app's design
 * system is `@medusajs/ui`, not Geist (workspace rule 27).
 *
 * The list is fetched once per city and filtered in the browser: 142 points for
 * Moscow on the live account (measured 2026-09-16), which is a single answer and
 * a filter that never waits on the network while the buyer types.
 *
 * The list, not the map, is the primary control: it works with no key, no
 * network to a third party and no pointer. On a narrow screen the map is a tab
 * the buyer opens, so the sheet at 390 px is the list — which is also what
 * happens when the map key is missing (`pickup-map-failed`).
 */
export default function CheckoutCdekPointSheet({
  open,
  onClose,
  initialCity,
  pointType,
  selectedCode,
  onChoose,
  priceLabel,
  termLabel,
}: CdekPointSheetProps) {
  const t = useTranslations("CdekPoint")

  const [city, setCity] = useState(initialCity)
  const [points, setPoints] = useState<CdekStorePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [query, setQuery] = useState("")
  const [choosingCode, setChoosingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The point the buyer tapped on the map, shown as a card above the list. */
  const [previewCode, setPreviewCode] = useState<string | null>(null)
  /** Narrow screens show one of the two at a time; the list is the default. */
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list")

  /**
   * Which fetch the points on screen came from. An answer for a city the buyer
   * has already moved on from must not replace a newer one: the requests are
   * fired from a debounced effect and can land out of order.
   */
  const requestRef = useRef(0)
  /** The row of the point picked on the map, so the list can scroll to it. */
  const rowsRef = useRef<Record<string, HTMLLIElement | null>>({})

  useEffect(() => {
    if (!open) {
      setQuery("")
      setError(null)
      setPreviewCode(null)
      setMobileTab("list")
      return
    }
    setCity(initialCity)
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
      fetchCdekPoints({ city: term, type: pointType })
        .then((answer) => {
          if (ticket !== requestRef.current) return
          setConfigured(answer.configured)
          setPoints(answer.points ?? [])
          setPreviewCode(null)
        })
        .finally(() => {
          if (ticket === requestRef.current) setLoading(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [open, city, pointType])

  const trimmedQuery = query.trim()
  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return points
    return points.filter((point) =>
      [point.name, point.address, point.metro, point.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [points, trimmedQuery])

  /**
   * The map draws what the list shows. Filtering to one point and leaving the
   * map on all of them would be two answers to one question.
   */
  const preview = useMemo(
    () => filtered.find((point) => point.code === previewCode) ?? null,
    [filtered, previewCode]
  )

  const choose = async (point: CdekStorePoint) => {
    setChoosingCode(point.code)
    setError(null)
    const message = await onChoose(point)
    setChoosingCode(null)
    if (message) {
      setError(message)
      return
    }
    onClose()
  }

  /** A tap on the map: preview the point and bring its row into view. */
  const selectOnMap = (point: CdekStorePoint) => {
    setPreviewCode(point.code)
    const row = rowsRef.current[point.code]
    row?.scrollIntoView({ block: "nearest" })
  }

  const cityChosen = Boolean(city.trim())

  const mapPane = (
    <CheckoutPickupMap
      points={filtered}
      selectedCode={previewCode ?? selectedCode}
      onSelect={selectOnMap}
      className="h-[320px] w-full rounded-md border border-ui-border-base small:h-full small:min-h-[360px]"
      emptyHint={t("mapEmpty")}
      failedHint={t("mapFailed")}
    />
  )

  const pointRows = (
    <ul
      className="flex max-h-[50vh] flex-col overflow-y-auto small:max-h-[420px]"
      data-testid="cdek-point-list"
    >
      {filtered.map((point) => {
        const isChosen = point.code === selectedCode
        const isPreview = point.code === previewCode

        return (
          <li
            key={point.code}
            ref={(el) => {
              rowsRef.current[point.code] = el
            }}
            className={clx(
              "flex items-center justify-between gap-x-3 border-t border-ui-border-base py-3 first:border-t-0",
              (isChosen || isPreview) && "-mx-2 rounded-md bg-ui-bg-subtle px-2"
            )}
            data-testid="cdek-point-row"
            data-point-code={point.code}
          >
            <div className="flex min-w-0 flex-col gap-y-0.5">
              <span className="txt-compact-medium-plus text-ui-fg-base">{point.name}</span>
              <span className="txt-compact-small text-ui-fg-subtle flex items-start gap-x-1.5">
                <MapPin size={14} />
                <span>{point.address}</span>
              </span>
              {point.metro && (
                <span className="txt-compact-small text-ui-fg-muted">{point.metro}</span>
              )}
              {point.work_time && (
                <span className="txt-compact-small text-ui-fg-subtle flex items-center gap-x-1.5">
                  <Clock className="shrink-0" />
                  <span>{point.work_time}</span>
                </span>
              )}
            </div>
            <Button
              variant={isChosen ? "secondary" : "primary"}
              size="small"
              isLoading={choosingCode === point.code}
              disabled={choosingCode !== null}
              onClick={() => choose(point)}
              data-testid="cdek-point-choose"
            >
              {isChosen ? t("chosen") : t("choose")}
            </Button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <CheckoutModal open={open} onClose={onClose} title={t("chooseHeading")} wide>
      <div className="flex flex-col gap-y-4">
        <SuggestInput<CdekCity>
          label={t("cityLabel")}
          value={city}
          onValueChange={setCity}
          onPick={(picked) => setCity(picked.city)}
          fetchItems={fetchCdekCities}
          itemKey={(item) => String(item.code)}
          itemLabel={(item) => item.city}
          itemHint={(item) => item.region}
          autoComplete="address-level2"
          testId="cdek-point-city"
        />

        <div className="flex items-center gap-x-2 rounded-md border border-ui-border-base px-3">
          <MagnifyingGlass className="shrink-0 text-ui-fg-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full bg-transparent txt-compact-medium text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
            data-testid="cdek-point-search"
          />
        </div>

        {error && <p className="txt-compact-small text-rose-500">{error}</p>}

        {!configured ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center">
            {t("notConfigured")}
          </p>
        ) : !cityChosen ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center">{t("needCity")}</p>
        ) : loading ? (
          <p
            className="txt-compact-small text-ui-fg-subtle py-6 text-center"
            data-testid="cdek-point-loading"
          >
            {t("loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="txt-compact-small text-ui-fg-subtle py-6 text-center">
            {t("noResults", { city: city.trim() })}
          </p>
        ) : (
          <div className="flex flex-col gap-y-3">
            <div className="flex items-center justify-between gap-x-3">
              <p className="txt-compact-xsmall text-ui-fg-muted" data-testid="cdek-point-count">
                {t("found", { count: filtered.length })}
              </p>
              {(priceLabel || termLabel) && (
                <p
                  className="txt-compact-xsmall text-ui-fg-subtle"
                  data-testid="cdek-point-method-summary"
                >
                  {[priceLabel, termLabel].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* The tabs exist on narrow screens only: above `small` both panes
                stand side by side and switching would hide half the answer. */}
            <div className="flex gap-x-2 small:hidden" role="tablist">
              {(["list", "map"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => setMobileTab(tab)}
                  className={clx(
                    "h-9 flex-1 rounded-md border txt-compact-small",
                    mobileTab === tab
                      ? "border-ui-border-interactive bg-ui-bg-base text-ui-fg-base"
                      : "border-ui-border-base text-ui-fg-subtle"
                  )}
                  data-testid={`cdek-point-tab-${tab}`}
                >
                  {tab === "list" ? t("tabList") : t("tabMap")}
                </button>
              ))}
            </div>

            {preview && (
              <div
                className="flex flex-col gap-y-1 rounded-md border border-ui-border-interactive p-3"
                data-testid="cdek-point-card"
              >
                <span className="txt-compact-medium-plus text-ui-fg-base">{preview.name}</span>
                <span className="txt-compact-small text-ui-fg-subtle">{preview.address}</span>
                {preview.work_time && (
                  <span className="txt-compact-small text-ui-fg-subtle">{preview.work_time}</span>
                )}
                {preview.phone && (
                  <span className="txt-compact-small text-ui-fg-muted">{preview.phone}</span>
                )}
                {(priceLabel || termLabel) && (
                  <span className="txt-compact-small text-ui-fg-subtle">
                    {[priceLabel, termLabel].filter(Boolean).join(" · ")}
                  </span>
                )}
                <Button
                  variant={preview.code === selectedCode ? "secondary" : "primary"}
                  size="small"
                  className="mt-2 w-fit"
                  isLoading={choosingCode === preview.code}
                  disabled={choosingCode !== null}
                  onClick={() => choose(preview)}
                  data-testid="cdek-point-card-choose"
                >
                  {preview.code === selectedCode ? t("chosen") : t("choose")}
                </Button>
              </div>
            )}

            <div className="grid gap-3 small:grid-cols-2">
              <div className={clx("min-w-0", mobileTab === "map" && "hidden small:block")}>
                {pointRows}
              </div>
              <div className={clx("min-w-0", mobileTab === "list" && "hidden small:block")}>
                {mapPane}
              </div>
            </div>
          </div>
        )}
      </div>
    </CheckoutModal>
  )
}
