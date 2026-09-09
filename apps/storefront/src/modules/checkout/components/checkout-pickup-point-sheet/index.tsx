"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import { usePickupSheet } from "@modules/checkout/context/pickup-sheet-context"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import {
  listPickupPoints,
  type StorePickupPoint,
} from "@lib/data/fulfillment"
import { updateCart } from "@lib/data/cart"
import MapPin from "@modules/common/icons/map-pin"
import { Clock, Loader, MagnifyingGlass } from "@medusajs/icons"
import { Button, clx } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"

interface CheckoutPickupPointSheetProps {
  cart: HttpTypes.StoreCart
}

/**
 * D2 §1-§5. Opened by `checkout-shipping-section` the moment "Pickup" is
 * chosen with no point on the cart yet, and reopened by `checkout-info-rows`
 * when the chosen point's row is tapped — both through `usePickupSheet()`.
 * Points come from `GET /store/pickup-points` (`lib/data/fulfillment.ts`),
 * filtered client-side (design decision, `2026-09-09-checkout-states-mockup.md`
 * "Design decisions taken": a handful of seeded points, no paginated catalog).
 * The choice is written to `cart.metadata` (D2's own decision, not
 * `shipping_address`, which `checkout-shipping-section` already blanks on
 * pickup) as `pickup_point_id/name/address/hours` — the shape
 * `checkout-info-rows` and `checkout-pickup-summary` both read back.
 */
export default function CheckoutPickupPointSheet({
  cart,
}: CheckoutPickupPointSheetProps) {
  const t = useTranslations("PickupPoint")
  const router = useRouter()
  const { isOpen, closeSheet } = usePickupSheet()
  const { trackCartUpdate } = useCartUpdate()

  const [points, setPoints] = useState<StorePickupPoint[] | null>(null)
  const [query, setQuery] = useState("")
  const [choosingId, setChoosingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || points !== null) return
    listPickupPoints().then(setPoints)
  }, [isOpen, points])

  useEffect(() => {
    if (!isOpen) setQuery("")
  }, [isOpen])

  const meta = cart.metadata as Record<string, string> | null
  const chosenId = meta?.pickup_point_id

  const trimmedQuery = query.trim()

  const filtered = useMemo(() => {
    if (!points) return []
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return points
    return points.filter((point) =>
      [point.name, point.address.address_1, point.address.city]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [points, trimmedQuery])

  const handleChoose = async (point: StorePickupPoint) => {
    setChoosingId(point.id)
    setError(null)

    const addressText = [
      point.address.address_1,
      point.address.postal_code,
      point.address.city,
    ]
      .filter(Boolean)
      .join(", ")

    const err = await trackCartUpdate(() =>
      updateCart({
        metadata: {
          ...(cart.metadata ?? {}),
          pickup_point_id: point.id,
          pickup_point_name: point.name,
          pickup_point_address: addressText,
          pickup_point_hours: point.opening_hours,
        },
      } as HttpTypes.StoreUpdateCart)
    )
      .then(() => null)
      .catch((e: Error) => e.message)

    setChoosingId(null)

    if (err) {
      setError(err)
      return
    }

    closeSheet()
    router.refresh()
  }

  return (
    <CheckoutModal
      open={isOpen}
      onClose={closeSheet}
      title={t("chooseHeading")}
    >
      <div className="flex flex-col gap-y-4">
        <div className="flex items-center gap-x-2 rounded-md border border-ui-border-base px-3">
          <MagnifyingGlass className="shrink-0 text-ui-fg-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full bg-transparent txt-compact-medium text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
            data-testid="pickup-point-search"
          />
        </div>

        {error && <p className="txt-compact-small text-rose-500">{error}</p>}

        {points === null ? (
          <div className="flex justify-center py-10">
            <Loader className="h-5 w-5 animate-spin text-ui-fg-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="txt-compact-small text-ui-fg-subtle text-center py-6">
            {t("noResults", { query: trimmedQuery })}
          </p>
        ) : (
          <div className="flex flex-col">
            {trimmedQuery && (
              <p className="txt-compact-xsmall text-ui-fg-muted pb-2">
                {t("matchCount", { count: filtered.length, query: trimmedQuery })}
              </p>
            )}
            <ul className="flex flex-col" data-testid="pickup-point-list">
              {filtered.map((point) => {
                const isChosen = point.id === chosenId
                return (
                  <li
                    key={point.id}
                    className={clx(
                      "flex items-center justify-between gap-x-3 border-t border-ui-border-base py-3 first:border-t-0",
                      isChosen && "bg-ui-bg-subtle -mx-2 px-2 rounded-md"
                    )}
                    data-testid="pickup-point-row"
                  >
                    <div className="flex min-w-0 flex-col gap-y-0.5">
                      <span className="txt-compact-medium-plus text-ui-fg-base">
                        {point.name}
                      </span>
                      <span className="txt-compact-small text-ui-fg-subtle flex items-center gap-x-1.5">
                        <MapPin size={14} />
                        <span>
                          {[point.address.address_1, point.address.city]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </span>
                      <span className="txt-compact-small text-ui-fg-subtle flex items-center gap-x-1.5">
                        <Clock className="shrink-0" />
                        <span>{point.opening_hours}</span>
                      </span>
                    </div>
                    <Button
                      variant={isChosen ? "secondary" : "primary"}
                      size="small"
                      isLoading={choosingId === point.id}
                      disabled={choosingId !== null}
                      onClick={() => handleChoose(point)}
                      data-testid="pickup-point-choose"
                    >
                      {t("choose")}
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
