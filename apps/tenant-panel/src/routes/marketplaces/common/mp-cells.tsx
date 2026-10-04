import { Tooltip, clx } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { Thumbnail } from "../../../components/common/thumbnail"
import { TruncatedText } from "../../../components/common/truncated-text"
import { useDate } from "../../../hooks/use-date"
import { getStylizedAmount } from "../../../lib/money-amount-helpers"
import type { MpLinkState } from "../../../hooks/api/marketplace-section"

/**
 * The cells the marketplace screens share (mp-section-design). Every one of
 * them is the cell «Товары» of the shop already draws, or a one-line variant of
 * it, so a marketplace table reads like the shop's table next door.
 */

/** «5 окт. 2026 г., 02:22»: the owner's glossary wants the time next to the date on a sync column. */
export const DateTimeCell = ({ date }: { date: string | null | undefined }) => {
  const { getFullDate } = useDate()
  if (!date) {
    return <PlaceholderCell />
  }
  return (
    <div className="flex h-full w-full items-center overflow-hidden">
      <span className="truncate">{getFullDate({ date, includeTime: true })}</span>
    </div>
  )
}

/** Thumbnail plus title, like `ProductCell`; the article under the title when there is one. */
export const CardCell = ({
  title,
  thumbnail,
  subtitle,
}: {
  title: string | null
  thumbnail: string | null
  subtitle?: string | null
}) => (
  <div className="flex h-full w-full max-w-[320px] items-center gap-x-3 overflow-hidden">
    <div className="w-fit flex-shrink-0">
      <Thumbnail src={thumbnail} />
    </div>
    <div className="flex min-w-0 flex-col">
      <TruncatedText text={title ?? "—"} />
      {subtitle ? (
        <span className="text-ui-fg-subtle txt-compact-xsmall truncate">{subtitle}</span>
      ) : null}
    </div>
  </div>
)

export const MoneyCell = ({
  amount,
  currency,
  strike,
  align = "left",
}: {
  amount: number | null | undefined
  currency: string | null
  strike?: number | null
  align?: "left" | "right"
}) => {
  if (amount === null || amount === undefined) {
    return <PlaceholderCell />
  }
  const code = currency ?? "RUB"
  return (
    <div
      className={clx("flex h-full w-full items-center gap-x-2 overflow-hidden", {
        "justify-end text-right": align === "right",
      })}
    >
      <span className="truncate tabular-nums">{getStylizedAmount(amount, code)}</span>
      {strike && strike !== amount ? (
        <span className="text-ui-fg-muted txt-compact-xsmall truncate tabular-nums line-through">
          {getStylizedAmount(strike, code)}
        </span>
      ) : null}
    </div>
  )
}

/** A count with its unit, `null` as the placeholder and never as 0 (rule 20a). */
export const UnitsCell = ({ value, unit }: { value: number | null | undefined; unit?: string }) => {
  const { i18n } = useTranslation()
  if (value === null || value === undefined) {
    return <PlaceholderCell />
  }
  return (
    <div className="flex h-full w-full items-center overflow-hidden">
      <span className="truncate tabular-nums">
        {new Intl.NumberFormat(i18n.language || "ru").format(value)}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  )
}

const LINK_COLOR: Record<MpLinkState, "green" | "orange" | "grey"> = {
  linked: "green",
  needs_choice: "orange",
  not_found: "grey",
}

/** «Связан с товаром», «Требует выбора», «Нет в магазине». */
export const LinkStateCell = ({ state, productTitle }: { state: MpLinkState; productTitle?: string | null }) => {
  const { t } = useTranslation()
  const label = t(`mp.linkState.${state}`)
  const cell = <StatusCell color={LINK_COLOR[state]}>{label}</StatusCell>
  if (!productTitle) {
    return cell
  }
  return (
    <Tooltip content={productTitle}>
      <div className="h-full w-full">{cell}</div>
    </Tooltip>
  )
}

/** A signed difference under a number: «+120 ₽ (+12 %)», red above the threshold. */
export const DiffLine = ({
  abs,
  pct,
  unit,
  highlighted,
}: {
  abs: number | null
  pct?: number | null
  unit: string
  highlighted: boolean
}) => {
  const { i18n } = useTranslation()
  if (abs === null) {
    return null
  }
  const signed = (value: number, digits = 0) =>
    new Intl.NumberFormat(i18n.language || "ru", {
      maximumFractionDigits: digits,
      signDisplay: "exceptZero",
    }).format(value)
  return (
    <span
      className={clx("txt-compact-xsmall tabular-nums", highlighted ? "text-ui-fg-error" : "text-ui-fg-subtle")}
    >
      {signed(abs)} {unit}
      {pct !== null && pct !== undefined ? ` (${signed(pct, 1)} %)` : ""}
    </span>
  )
}
