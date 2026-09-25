import { Badge, Table, Text } from "@medusajs/ui"

import type { AnalyticsCard } from "../../../../../hooks/api/marketplace-analytics"

/**
 * Таблица карточек: одна строка — одна карточка площадки, и в ней стоят ВСЕ
 * числа экрана сразу (w19-mp-analytics).
 *
 * Одна строка, а не четыре таблицы рядом, потому что вопрос владелицы звучит
 * «что с этим товаром», а не «покажи мне ABC». Класс, вариация, остаток и срок
 * до нуля стоят рядом с выручкой, и их видно вместе.
 *
 * ЧЕГО НЕТ, ТО НАПИСАНО СЛОВОМ. `—` стоит там, где площадка не прислала
 * значения; «нет класса» — там, где сравнивать не с чем; «продаж нет» — у
 * карточки, которая за период не продалась ни разу, но лежит на складе
 * (правило 20a). Ни одно из этих мест не показывает ноль.
 */

type Props = {
  cards: AnalyticsCard[]
  currency: string | null
  locale: string
  marketplaceLabels: Record<string, string>
}

const ABC_HINT: Record<AnalyticsCard["abc"], string> = {
  A: "верхние 80 % выручки",
  B: "следующие 15 %",
  C: "последние 5 %",
}

const XYZ_HINT: Record<"X" | "Y" | "Z", string> = {
  X: "ровный спрос",
  Y: "спрос колеблется",
  Z: "рваный спрос",
}

export const CardsTable = ({ cards, currency, locale, marketplaceLabels }: Props) => {
  const money = (value: number | null) =>
    value === null
      ? "—"
      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}${
          currency ? ` ${currency}` : ""
        }`

  const number = (value: number | null, unit: string) =>
    value === null ? "—" : `${new Intl.NumberFormat(locale).format(value)} ${unit}`

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Карточка</Table.HeaderCell>
          <Table.HeaderCell>Площадка</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Выручка</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Штук</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Средняя цена</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Доля выручки</Table.HeaderCell>
          <Table.HeaderCell>ABC</Table.HeaderCell>
          <Table.HeaderCell>XYZ</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Остаток</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Темп</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Дней до нуля</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {cards.map((card) => (
          <Table.Row key={`${card.marketplace}-${card.card_id ?? "no-id"}`}>
            <Table.Cell>
              <Text
                size="small"
                weight="plus"
                className="truncate"
                title={[card.vendor_code, card.card_id].filter(Boolean).join(" · ") || undefined}
              >
                {card.title ?? card.vendor_code ?? card.card_id ?? "без названия"}
              </Text>
            </Table.Cell>
            <Table.Cell>{marketplaceLabels[card.marketplace] ?? card.marketplace}</Table.Cell>
            <Table.Cell className="text-right">
              {card.units === 0 ? (
                <Text className="text-ui-fg-muted" size="small">
                  продаж нет
                </Text>
              ) : (
                money(card.revenue)
              )}
            </Table.Cell>
            <Table.Cell
              className="text-right"
              title={card.cancelled_units > 0 ? `отменено ${card.cancelled_units} шт` : undefined}
            >
              {card.units === 0 ? "—" : number(card.units, "шт")}
            </Table.Cell>
            <Table.Cell className="text-right">{money(card.avg_price)}</Table.Cell>
            <Table.Cell className="text-right">
              {`${card.revenue_share.toFixed(1)} %`}
            </Table.Cell>
            <Table.Cell title={ABC_HINT[card.abc]}>
              <Badge size="2xsmall" color={card.abc === "A" ? "green" : card.abc === "B" ? "blue" : "grey"}>
                {card.abc}
              </Badge>
            </Table.Cell>
            <Table.Cell
              title={
                card.xyz === null
                  ? undefined
                  : `${XYZ_HINT[card.xyz]}, CV ${Math.round(card.variation ?? 0)} %`
              }
            >
              {card.xyz === null ? (
                <Text className="text-ui-fg-muted" size="xsmall">
                  нет класса: сравнивать не с чем
                </Text>
              ) : (
                <Badge
                  size="2xsmall"
                  color={card.xyz === "X" ? "green" : card.xyz === "Y" ? "blue" : "orange"}
                >
                  {card.xyz}
                </Badge>
              )}
            </Table.Cell>
            <Table.Cell
              className="text-right"
              title={
                card.turnover.stock === null
                  ? undefined
                  : `строк остатка: ${card.turnover.offer_lines}`
              }
            >
              {card.turnover.stock === null ? (
                <Text className="text-ui-fg-muted" size="xsmall">
                  площадка не прислала
                </Text>
              ) : (
                number(card.turnover.stock, "шт")
              )}
            </Table.Cell>
            <Table.Cell className="text-right">
              {card.turnover.rate_per_day > 0
                ? `${card.turnover.rate_per_day.toFixed(2)} шт/день`
                : "—"}
            </Table.Cell>
            <Table.Cell
              className="text-right"
              title={
                card.turnover.stock !== 0 && card.turnover.days_to_zero !== null && card.turnover.zero_on
                  ? `до ${card.turnover.zero_on}`
                  : undefined
              }
            >
              {card.turnover.stock === 0 ? (
                /* Ноль на складе — это «кончился», а не «кончится через 0 дней». */
                <Text className="text-ui-fg-muted" size="xsmall">
                  остаток кончился
                </Text>
              ) : card.turnover.days_to_zero === null ? (
                <Text className="text-ui-fg-muted" size="xsmall">
                  {card.turnover.stock === null ? "площадка не прислала остаток" : "продаж за период нет"}
                </Text>
              ) : (
                `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                  card.turnover.days_to_zero
                )} дн.`
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}
