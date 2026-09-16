import { Badge, Text } from "@medusajs/ui"

import type { AnalyticsSource } from "../../../../../hooks/api/marketplace-analytics"

/**
 * Блок, у которого может НЕ БЫТЬ числа: рейтинг продавца и P&L
 * (w19-mp-analytics).
 *
 * Оба живут у площадки, и оба могут быть недоступны. Пустой рейтинг читается
 * как «рейтинг ноль», а посчитанная «прибыль» из того, что у нас есть, была бы
 * выдуманным числом — поэтому блок показывает СОСТОЯНИЕ словами и, если
 * площадка отказала, её собственный ответ: код и когда он получен.
 *
 * Состояние приходит с бэкенда одним значением (`state`), а не собирается тут
 * из трёх флагов: решение о том, что можно показать, принято в одном месте и
 * закрыто юнит-тестами.
 */

const STATE_LABEL: Record<AnalyticsSource["state"], string> = {
  ok: "есть",
  no_key: "нет ключа",
  refused: "площадка отказала",
  never_asked: "ещё не спрашивали",
  scope_missing: "недоступно ключу",
}

const STATE_COLOR: Record<AnalyticsSource["state"], "green" | "grey" | "orange" | "red"> = {
  ok: "green",
  no_key: "grey",
  refused: "orange",
  never_asked: "grey",
  scope_missing: "orange",
}

export const SourceBlock = ({
  source,
  value,
  locale,
}: {
  source: AnalyticsSource
  /** Число, когда оно есть. Нет — блок объясняет, почему. */
  value?: string | null
  locale: string
}) => (
  <div className="flex flex-col gap-y-1 border-b border-ui-border-base py-3 last:border-b-0">
    <div className="flex items-center gap-x-2">
      <Text size="small" weight="plus">
        {source.label}
      </Text>
      <Badge color={STATE_COLOR[source.state]} size="2xsmall">
        {STATE_LABEL[source.state]}
      </Badge>
      {value ? (
        <Text size="small" weight="plus">
          {value}
        </Text>
      ) : null}
    </div>

    <Text className="text-ui-fg-subtle" size="small">
      {source.detail}
    </Text>

    {source.refusal ? (
      <Text className="text-ui-fg-muted" size="xsmall">
        {/*
          Текст журнала часто и есть «HTTP 403» — печатать его вторым разом
          значит писать «HTTP 403 — HTTP 403». Показываем текст, только когда он
          добавляет что-то к коду.
        */}
        {`Ответ площадки: HTTP ${source.refusal.status ?? "?"}${
          source.refusal.text && source.refusal.text !== `HTTP ${source.refusal.status}`
            ? ` — ${source.refusal.text}`
            : ""
        }${
          source.refusal.at
            ? `, ${new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(source.refusal.at))}`
            : ""
        }${source.endpoint ? `. Метод: ${source.endpoint}` : ""}`}
      </Text>
    ) : null}

    {source.see ? (
      <Text className="text-ui-fg-muted" size="xsmall">
        {`Где посмотреть права ключа: ${source.see}`}
      </Text>
    ) : null}
  </div>
)
