"use client"

import type { ReactNode } from "react"
import { Button, clx } from "@medusajs/ui"
import { Clock } from "@medusajs/icons"

import type { PickupMapKind } from "@modules/checkout/components/checkout-pickup-map"
import MapPin from "@modules/common/icons/map-pin"

/** One line of a point: the place with a pin, the hours with a clock, or plain text. */
export type PickupRowLine = { icon?: "pin" | "clock"; text: string }

/**
 * A pickup point as the picker draws it, whatever the carrier (t-2026-10-12-03, decision D2).
 * Each carrier maps its own answer to this shape (`checkout-cdek-point-sheet/rows.ts`,
 * `checkout-pochta-point-sheet/rows.ts`); the picker never reads a carrier's fields.
 */
export type PickupRow = {
  id: string
  title: string
  /** Under the title in every row: the place and the hours. */
  lines: PickupRowLine[]
  /** Only in the expanded row and on the map card: directions, metro, phone. */
  extras: PickupRowLine[]
  lat: number | null
  lng: number | null
  kind: PickupMapKind
  /** What the search box matches against. */
  searchText: string
}

/** The price · term of the selected point, and whether «Выбрать» has to wait for it. */
export type PickupPrice = {
  label: string | null
  loading: boolean
  /** The carrier could not price this point; «Выбрать» stays off. */
  failed: string | null
}

const Line = ({ line, tone = "subtle" }: { line: PickupRowLine; tone?: "subtle" | "muted" }) => (
  <span
    className={clx(
      "txt-compact-small flex items-start gap-x-1.5",
      tone === "subtle" ? "text-ui-fg-subtle" : "text-ui-fg-muted"
    )}
  >
    {line.icon === "pin" && <MapPin size={14} />}
    {line.icon === "clock" && <Clock className="shrink-0" />}
    <span>{line.text}</span>
  </span>
)

/** The title and the always-visible lines, shared by the row and the map card. */
export function PointSummary({ row }: { row: PickupRow }) {
  return (
    <>
      <span className="txt-compact-medium-plus text-ui-fg-base">{row.title}</span>
      {row.lines.map((line, i) => (
        <Line key={i} line={line} />
      ))}
    </>
  )
}

type PointDetailsProps = {
  row: PickupRow
  price: PickupPrice
  /** This point is the one already on the cart. */
  chosen: boolean
  choosing: boolean
  error: string | null
  chooseLabel: string
  chosenLabel: string
  onChoose: () => void
  testIdPrefix: string
  /** `row` for the expanded list row, `map-card` for the card on the mobile map. */
  place: "row" | "map-card"
}

/**
 * What the selected point adds: the extras, the price · term and «Выбрать». The same block in
 * the expanded row (item 3.4) and on the map card (item 3.6), so the two read alike.
 */
export function PointDetails({
  row,
  price,
  chosen,
  choosing,
  error,
  chooseLabel,
  chosenLabel,
  onChoose,
  testIdPrefix,
  place,
}: PointDetailsProps) {
  const prefix = place === "row" ? testIdPrefix : `${testIdPrefix}-map-card`
  return (
    <div className="flex flex-col gap-y-1">
      {row.extras.map((line, i) => (
        <Line key={i} line={line} tone="muted" />
      ))}
      {(price.loading || price.label) && (
        <span className="txt-compact-medium-plus text-ui-fg-base mt-1" data-testid={`${prefix}-quote`}>
          {price.loading ? "…" : price.label}
        </span>
      )}
      {price.failed && <span className="txt-compact-small text-ui-fg-error">{price.failed}</span>}
      {error && <span className="txt-compact-small text-ui-fg-error">{error}</span>}
      <Button
        variant={chosen ? "secondary" : "primary"}
        size="base"
        className="mt-2 w-full small:w-fit"
        isLoading={choosing}
        disabled={choosing || price.loading || !!price.failed}
        onClick={onChoose}
        data-testid={`${prefix}-choose`}
      >
        {chosen ? chosenLabel : chooseLabel}
      </Button>
    </div>
  )
}

type PointRowProps = {
  row: PickupRow
  selected: boolean
  onSelect: () => void
  /** The details block, given only to the selected row. */
  children?: ReactNode
  testIdPrefix: string
  rowRef?: (el: HTMLLIElement | null) => void
}

/**
 * One row of the list. Rows run edge to edge of the picker and carry their horizontal padding
 * inside, so the selected row's subtle background never meets its text (item 3.5, Image #3).
 * The tappable part is a real button; the details sit under it, since a button may not hold
 * «Выбрать».
 */
export function PointRow({ row, selected, onSelect, children, testIdPrefix, rowRef }: PointRowProps) {
  return (
    <li
      ref={rowRef}
      className={clx(
        "border-t border-ui-border-base first:border-t-0",
        selected && "bg-ui-bg-subtle"
      )}
      data-testid={`${testIdPrefix}-row`}
      data-point-id={row.id}
      data-selected={selected ? "true" : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="flex w-full flex-col gap-y-0.5 px-4 py-3 text-start outline-none focus-visible:shadow-borders-field-focus small:px-6"
      >
        <PointSummary row={row} />
      </button>
      {selected && children && <div className="px-4 pb-4 small:px-6">{children}</div>}
    </li>
  )
}
