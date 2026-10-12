"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { convertToLocale } from "@lib/util/money"
import {
  fetchPochtaCities,
  fetchPochtaPoints,
  fetchPochtaQuote,
  pochtaQuoteLabel,
  type PochtaCity,
  type PochtaStorePoint,
} from "@lib/util/pochta"
import PickupPointPicker from "@modules/checkout/components/pickup-point-picker"
import SuggestInput from "@modules/common/components/suggest-input"

import { pochtaRowOf } from "./rows"

export type PochtaPointSheetProps = {
  open: boolean
  onClose: () => void
  /** The city the buyer's address already names; the sheet starts there. */
  initialCity: string
  /** Index of the point already on the cart, selected when the picker opens. */
  selectedIndex: string | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: PochtaStorePoint) => Promise<string | null>
  currencyCode: string
}

/**
 * The Russian Post pickup-point picker (46df-pochta): its city directory, its points and
 * its price per point, drawn by the picker CDEK shares (t-2026-10-12-03, decision D2), so a
 * buyer who meets both meets one control. A Russian Post price depends on the point's
 * region, so the selected point fetches its own price and term before «Выбрать» is offered.
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

  const requestRef = useRef(0)

  useEffect(() => {
    if (!open) return
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
        })
        .finally(() => {
          if (ticket === requestRef.current) setLoading(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [open, city, region])

  const priceLabel = (amount: number) =>
    convertToLocale({ amount, currency_code: currencyCode, locale })

  const quoteOf = async (point: PochtaStorePoint, signal: AbortSignal) => {
    const answer = await fetchPochtaQuote({ index: point.index, kind: point.kind }, signal)
    return answer.quote ? pochtaQuoteLabel(answer.quote, priceLabel) : null
  }

  const cityTerm = city.trim()
  const notice = !configured
    ? { text: t("notConfigured") }
    : !cityTerm
      ? { text: tPoint("needCity") }
      : loading
        ? { text: tPoint("loading"), testId: "pochta-point-loading" }
        : null

  return (
    <PickupPointPicker<PochtaStorePoint>
      open={open}
      onClose={onClose}
      testIdPrefix="pochta-point"
      cityField={
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
      }
      notice={notice}
      points={points}
      rowOf={(point) => pochtaRowOf(point, (index) => t("postcode", { index }))}
      noResultsText={tPoint("noResults", { city: cityTerm })}
      chosenId={selectedIndex}
      onChoose={onChoose}
      quoteOf={quoteOf}
      quoteFailedText={t("quoteFailed")}
    />
  )
}
