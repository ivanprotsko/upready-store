import { Container, Text, clx } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { signedPct } from "./format"

/**
 * One of the four numbers on top, with its change against the previous
 * period. Green is good: for «Отменено» a rise is red (`inverse`); the average
 * check moves both ways for good reasons and stays grey (`neutral`).
 */
export const Tile = ({
  label,
  value,
  change,
  days,
  hint,
  rows,
  inverse,
  neutral,
  wide,
}: {
  /** Across the whole row on a phone and a tablet; one of four on a wide screen. */
  wide?: boolean
  label: string
  value: string
  change: number | null
  days: number
  hint?: string
  rows?: Array<[string, string]>
  inverse?: boolean
  neutral?: boolean
}) => {
  const { t, i18n } = useTranslation()
  const good = change === null || neutral ? null : inverse ? change < 0 : change > 0
  return (
    <Container className={clx("flex min-w-0 flex-col gap-y-1 px-5 py-4 max-md:px-4", wide && "col-span-2 xl:col-span-1")}>
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="xlarge" weight="plus" className="whitespace-nowrap tabular-nums">
        {value}
      </Text>
      {change !== null ? (
        <Text
          size="small"
          className={clx(
            "tabular-nums",
            good === null ? "text-ui-fg-subtle" : good ? "text-ui-tag-green-text" : "text-ui-fg-error"
          )}
        >
          {t("mp.analytics.v3.tiles.change", { value: signedPct(change, i18n.language || "ru"), days })}
        </Text>
      ) : null}
      {rows?.length ? (
        <div className="border-ui-border-base mt-1 flex flex-col gap-y-0.5 border-t pt-2">
          {rows.map(([name, amount]) => (
            <div key={name} className="flex items-center justify-between gap-x-2">
              <Text size="small" className="text-ui-fg-subtle">
                {name}
              </Text>
              <Text size="small" className="whitespace-nowrap tabular-nums">
                {amount}
              </Text>
            </div>
          ))}
        </div>
      ) : null}
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      ) : null}
    </Container>
  )
}
