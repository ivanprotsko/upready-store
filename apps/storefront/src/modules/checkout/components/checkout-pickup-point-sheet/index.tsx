"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import { usePickupSheet } from "@modules/checkout/context/pickup-sheet-context"
import MapPin from "@modules/common/icons/map-pin"
import { Clock, MagnifyingGlass } from "@medusajs/icons"
import { Button, clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"

/**
 * D2 §1-§5. Opened by `checkout-shipping-section` the moment "Pickup" is
 * chosen with no point on the cart yet, and reopened by `checkout-info-rows`
 * when the chosen point's row is tapped — both through `usePickupSheet()`,
 * which also supplies the point list and the `choosePoint` mutation, so this
 * component is pure presentation: search input, filtered rows, a `Choose`
 * button. Filtered client-side (design decision,
 * `2026-09-09-checkout-states-mockup.md` "Design decisions taken": a
 * handful of seeded points, no paginated catalog).
 */
export default function CheckoutPickupPointSheet() {
  const t = useTranslations("PickupPoint")
  const {
    isOpen,
    closeSheet,
    points,
    selectedPointId,
    choosingId,
    error,
    choosePoint,
  } = usePickupSheet()

  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!isOpen) setQuery("")
  }, [isOpen])

  const trimmedQuery = query.trim()

  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase()
    if (!needle) return points
    return points.filter((point) =>
      [point.name, ...point.addressLines, point.city]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [points, trimmedQuery])

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
            className="h-10 w-full bg-transparent txt-compact-medium text-ui-fg-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] placeholder:text-ui-fg-muted"
            data-testid="pickup-point-search"
          />
        </div>

        {error && <p className="txt-compact-small text-ui-fg-error">{error}</p>}

        {filtered.length === 0 ? (
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
                const isChosen = point.id === selectedPointId
                const address = [...point.addressLines, point.city]
                  .filter(Boolean)
                  .join(", ")

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
                        <span>{address}</span>
                      </span>
                      {point.openingHours && (
                        <span className="txt-compact-small text-ui-fg-subtle flex items-center gap-x-1.5">
                          <Clock className="shrink-0" />
                          <span>{point.openingHours}</span>
                        </span>
                      )}
                    </div>
                    <Button
                      variant={isChosen ? "secondary" : "primary"}
                      size="small"
                      isLoading={choosingId === point.id}
                      disabled={choosingId !== null}
                      onClick={() => choosePoint(point)}
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
