import { Badge, Text } from "@medusajs/ui"

import type { Freshness } from "../../../../hooks/api/marketplace-price-stock"

/**
 * The age of one number, next to the number (deliverable 4).
 *
 * A number whose age is hidden is a number that lies, so every marketplace
 * column says when its data was measured and says «протухло» past the kind's
 * interval times three. The moment shown is `as_of` — the OLDER of the
 * marketplace's own measurement and our last successful import of that family,
 * because a price cannot be fresher than the import that brought it.
 *
 * The full sentence (both sources, the age, the window) travels in `title`, so
 * the cell stays a number and the explanation is one hover away (rule 18e).
 */

const NOT_SET = "—"

const shortMoment = (value: string | null): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return NOT_SET
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const LABEL: Record<Freshness["family"], string> = {
  prices: "цена",
  stocks: "остаток",
}

export const FreshnessMark = ({
  freshness,
  testId,
}: {
  freshness: Freshness
  testId?: string
}) => (
  <div className="flex flex-col gap-y-0.5" title={freshness.note} data-testid={testId}>
    <Text size="xsmall" className="text-ui-fg-subtle tabular-nums">
      {LABEL[freshness.family]}: {shortMoment(freshness.as_of)}
    </Text>
    {freshness.stale ? (
      <Badge size="2xsmall" color="red" data-testid={testId ? `${testId}-stale` : undefined}>
        протухло
      </Badge>
    ) : null}
  </div>
)
