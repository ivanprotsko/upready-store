"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button, clx } from "@medusajs/ui"
import { Clock, MagnifyingGlass } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { listCdekPoints } from "@lib/data/cdek"
import type { CdekStorePoint } from "@lib/util/cdek"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
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
}

/**
 * The CDEK pickup-point picker (i02-apiship-cdek-shipping).
 *
 * A separate sheet from `checkout-pickup-point-sheet`, which lists the shop's
 * OWN pickup locations: those are one shipping option each and already on the
 * page, while CDEK's are thousands of a carrier's offices behind one option and
 * have to be fetched per city. Everything they share visually (the modal, the
 * search row, the result rows, the Choose button) is copied from that sheet
 * deliberately, so a buyer who meets both meets one control. This app's design
 * system is `@medusajs/ui`, not Geist (workspace rule 27): a single checkout
 * sheet styled differently from its twin two lines away would be the drift.
 *
 * The list is fetched once per city and filtered in the browser: 203 points for
 * Saint Petersburg on the live account (measured 2026-09-16), which is a single
 * answer and a filter that never waits on the network while the buyer types.
 */
export default function CheckoutCdekPointSheet({
  open,
  onClose,
  initialCity,
  pointType,
  selectedCode,
  onChoose,
}: CdekPointSheetProps) {
  const t = useTranslations("CdekPoint")

  const [city, setCity] = useState(initialCity)
  const [points, setPoints] = useState<CdekStorePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [query, setQuery] = useState("")
  const [choosingCode, setChoosingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Which fetch the points on screen came from. An answer for a city the buyer
   * has already moved on from must not replace a newer one: the requests are
   * fired from a debounced effect and can land out of order.
   */
  const requestRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setError(null)
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
      listCdekPoints({ city: term, type: pointType })
        .then((answer) => {
          if (ticket !== requestRef.current) return
          setConfigured(answer.configured)
          setPoints(answer.points ?? [])
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

  return (
    <CheckoutModal open={open} onClose={onClose} title={t("chooseHeading")}>
      <div className="flex flex-col gap-y-4">
        <label className="flex flex-col gap-y-1">
          <span className="txt-compact-small text-ui-fg-subtle">
            {t("cityLabel")}
          </span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder={t("cityPlaceholder")}
            className="h-10 w-full rounded-md border border-ui-border-base bg-transparent px-3 txt-compact-medium text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
            data-testid="cdek-point-city"
          />
        </label>

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
          <p className="txt-compact-small text-ui-fg-subtle text-center py-6">
            {t("notConfigured")}
          </p>
        ) : !city.trim() ? (
          <p className="txt-compact-small text-ui-fg-subtle text-center py-6">
            {t("needCity")}
          </p>
        ) : loading ? (
          <p
            className="txt-compact-small text-ui-fg-subtle text-center py-6"
            data-testid="cdek-point-loading"
          >
            {t("loading")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="txt-compact-small text-ui-fg-subtle text-center py-6">
            {t("noResults", { city: city.trim() })}
          </p>
        ) : (
          <div className="flex flex-col">
            <p
              className="txt-compact-xsmall text-ui-fg-muted pb-2"
              data-testid="cdek-point-count"
            >
              {t("found", { count: filtered.length })}
            </p>
            <ul
              className="flex flex-col max-h-[50vh] overflow-y-auto"
              data-testid="cdek-point-list"
            >
              {filtered.map((point) => {
                const isChosen = point.code === selectedCode

                return (
                  <li
                    key={point.code}
                    className={clx(
                      "flex items-center justify-between gap-x-3 border-t border-ui-border-base py-3 first:border-t-0",
                      isChosen && "bg-ui-bg-subtle -mx-2 px-2 rounded-md"
                    )}
                    data-testid="cdek-point-row"
                  >
                    <div className="flex min-w-0 flex-col gap-y-0.5">
                      <span className="txt-compact-medium-plus text-ui-fg-base">
                        {point.name}
                      </span>
                      <span className="txt-compact-small text-ui-fg-subtle flex items-start gap-x-1.5">
                        <MapPin size={14} />
                        <span>{point.address}</span>
                      </span>
                      {point.metro && (
                        <span className="txt-compact-small text-ui-fg-muted">
                          {point.metro}
                        </span>
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
          </div>
        )}
      </div>
    </CheckoutModal>
  )
}
