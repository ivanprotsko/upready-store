"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import {
  fetchCdekCities,
  fetchCdekPoints,
  type CdekCity,
  type CdekStorePoint,
} from "@lib/util/cdek"
import PickupPointPicker from "@modules/checkout/components/pickup-point-picker"
import SuggestInput from "@modules/common/components/suggest-input"

import { cdekRowOf } from "./rows"

export type CdekPointSheetProps = {
  open: boolean
  onClose: () => void
  /** The city the buyer's address already names; the sheet starts there. */
  initialCity: string
  /** `POSTAMAT` when the chosen method is the locker one. */
  pointType: "PVZ" | "POSTAMAT"
  /** Code of the point already on the cart, selected when the picker opens. */
  selectedCode: string | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: CdekStorePoint) => Promise<string | null>
  /** The method's price, already formatted by the section that knows the currency. */
  priceLabel?: string | null
  /** The method's delivery term, as the carrier worded it. */
  termLabel?: string | null
}

/**
 * The CDEK pickup-point picker (i02-apiship-cdek-shipping, map and suggest added by
 * i03-checkout-pvz-map-address-suggest): CDEK's city directory and points, drawn by the
 * picker Russian Post shares (t-2026-10-12-03, decision D2).
 *
 * A separate sheet from `checkout-pickup-point-sheet`, which lists the shop's
 * OWN pickup locations: those are one shipping option each and already on the
 * page, while CDEK's are thousands of a carrier's offices behind one option and
 * have to be fetched per city.
 *
 * The list is fetched once per city and filtered in the browser: 142 points for
 * Moscow on the live account (measured 2026-09-16), which is a single answer and
 * a filter that never waits on the network while the buyer types. CDEK prices the
 * method, not the point, so every point shows the method's one price and term.
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

  /**
   * Which fetch the points on screen came from. An answer for a city the buyer
   * has already moved on from must not replace a newer one: the requests are
   * fired from a debounced effect and can land out of order.
   */
  const requestRef = useRef(0)

  useEffect(() => {
    if (!open) return
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
        })
        .finally(() => {
          if (ticket === requestRef.current) setLoading(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [open, city, pointType])

  const cityTerm = city.trim()
  const notice = !configured
    ? { text: t("notConfigured") }
    : !cityTerm
      ? { text: t("needCity") }
      : loading
        ? { text: t("loading"), testId: "cdek-point-loading" }
        : null

  return (
    <PickupPointPicker<CdekStorePoint>
      open={open}
      onClose={onClose}
      testIdPrefix="cdek-point"
      cityField={
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
      }
      notice={notice}
      points={points}
      rowOf={cdekRowOf}
      noResultsText={t("noResults", { city: cityTerm })}
      chosenId={selectedCode}
      onChoose={onChoose}
      methodPrice={[priceLabel, termLabel].filter(Boolean).join(" · ") || null}
    />
  )
}
