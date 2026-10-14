"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { fetchApishipPoints, type ApishipStorePoint } from "@lib/util/apiship"
import PickupPointPicker from "@modules/checkout/components/pickup-point-picker"
import SuggestInput from "@modules/common/components/suggest-input"

import { apishipRowOf } from "./rows"

export type ApishipPointSheetProps = {
  open: boolean
  onClose: () => void
  /** ApiShip's carrier key of the chosen method: `cdek`, `rupost`. */
  providerKey: string
  /** The city the buyer's address already names; the sheet starts there. */
  initialCity: string
  /** Id of the point already on the cart, selected when the picker opens. */
  selectedId: number | null
  /** Runs `setShippingMethod` with the point; returns an error message or null. */
  onChoose: (point: ApishipStorePoint) => Promise<string | null>
  /** The method's price and term, already worded by the section that knows the currency. */
  methodPrice?: string | null
}

/** ApiShip has no city directory: the city field suggests nothing and stays a plain input. */
const noCities = async (): Promise<string[]> => []

/**
 * The ApiShip pickup-point picker (t-2026-10-14-58, part B): one carrier's points
 * through the shop's ApiShip account, drawn by the picker the direct CDEK and Russian
 * Post sheets share (t-2026-10-12-03, decision D2), so a buyer meets one control
 * whichever way the shop connected the carrier.
 *
 * The list is fetched once per city and filtered in the browser, as CDEK's is. The
 * price shown is the method's own «от» price for the city: ApiShip prices the exact
 * point only once it is on the cart, and the row then shows that amount.
 */
export default function CheckoutApishipPointSheet({
  open,
  onClose,
  providerKey,
  initialCity,
  selectedId,
  onChoose,
  methodPrice,
}: ApishipPointSheetProps) {
  const t = useTranslations("CdekPoint")
  const tApiship = useTranslations("ApishipPoint")

  const [city, setCity] = useState(initialCity)
  const [points, setPoints] = useState<ApishipStorePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(true)

  /** Which fetch the points on screen came from; an older answer must not replace a newer one. */
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
      fetchApishipPoints({ providerKey, city: term })
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
  }, [open, city, providerKey])

  const cityTerm = city.trim()
  const notice = !configured
    ? { text: tApiship("notConfigured") }
    : !cityTerm
      ? { text: t("needCity") }
      : loading
        ? { text: t("loading"), testId: "apiship-point-loading" }
        : null

  return (
    <PickupPointPicker<ApishipStorePoint>
      open={open}
      onClose={onClose}
      testIdPrefix="apiship-point"
      cityField={
        <SuggestInput<string>
          label={t("cityLabel")}
          value={city}
          onValueChange={setCity}
          onPick={setCity}
          fetchItems={noCities}
          itemKey={(item) => item}
          itemLabel={(item) => item}
          autoComplete="address-level2"
          testId="apiship-point-city"
        />
      }
      notice={notice}
      points={points}
      rowOf={apishipRowOf}
      noResultsText={t("noResults", { city: cityTerm })}
      chosenId={selectedId === null ? null : String(selectedId)}
      onChoose={onChoose}
      methodPrice={methodPrice}
    />
  )
}
