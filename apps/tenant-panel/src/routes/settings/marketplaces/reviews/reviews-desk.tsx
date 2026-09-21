import { Alert, Badge, Button, Container, Heading, Select, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../../components/layout/pages"
import {
  useMarketplaceDesk,
  type DeskKind,
  type DeskQuery,
} from "../../../../hooks/api/marketplace-desk"
import { DeskItemCard } from "./components/desk-item"
import { SupportDetails } from "../../../../components/common/support-details"

/**
 * «Маркетплейсы → Отзывы» (w18-mp-reviews-desk): отзывы и вопросы покупателей
 * с обеих площадок в одном списке, с фильтрами и черновиком ответа.
 *
 * ОТПРАВКИ ОТВЕТА ЗДЕСЬ НЕТ И НЕ БУДЕТ НА ЭТОМ ЭКРАНЕ. Ответ на отзыв — это
 * запись в площадку, а платформа работает с Wildberries и Ozon только на
 * чтение (приказ Ивана 2026-09-16 02:46 WITA). Черновик хранится у нас, и
 * экран говорит об этом прямым текстом, а не умалчивает.
 *
 * Дизайн-система: `@medusajs/ui`, как на всех экранах этой панели — она копия
 * Medusa Admin 2.19. Расхождение с каноном Geist (правило 27) записано ещё в
 * отчёте w01 и повторено в отчёте этой задачи; ввозить Geist ради одного
 * экрана значило бы сделать его непохожим на два десятка соседних.
 */

const PERIODS = ["all", "7d", "30d", "90d", "365d"] as const
const RATINGS = [5, 4, 3, 2, 1] as const

const ANY = "any"

export const MarketplaceReviewsDesk = () => {
  const { t } = useTranslation()

  const [kind, setKind] = useState<DeskKind>("reviews")
  const [query, setQuery] = useState<DeskQuery>({
    marketplace: null,
    rating: null,
    answered: "all",
    period: "all",
  })

  const { desk, isPending, isError, error } = useMarketplaceDesk(kind, query)

  if (isError) {
    throw error
  }

  /**
   * Пока ответ не пришёл, у вкладок НЕТ числа — и это третье состояние, а не
   * ноль (правило 19h/20a). «0 отзывов» до ответа сервера — утверждение,
   * которое через секунду станет ложным.
   */
  const tabCount = (which: DeskKind): string =>
    desk ? String(desk.counts[which].filtered) : "…"

  const marketplaceLabel = (id: string): string =>
    t(`marketplaces.desk.marketplaceNames.${id}`, { defaultValue: id })

  const emptyReason: string = desk
    ? desk.filters.applied.length === 0
      ? t("marketplaces.desk.emptyNoFilters")
      : t("marketplaces.desk.emptyFiltered", {
          filters: desk.filters.applied
            .map((one) =>
              one.field === "marketplace"
                ? marketplaceLabel(one.value)
                : t(`marketplaces.desk.filterValues.${one.field}.${one.value}`, {
                    defaultValue: `${one.field}: ${one.value}`,
                  })
            )
            .join(" · "),
        })
    : ""

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="p-0">
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="flex items-center justify-between">
            <Heading>{t("marketplaces.desk.title")}</Heading>
            <Link
              to="/settings/marketplaces"
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small-plus"
            >
              {t("marketplaces.title")}
            </Link>
          </div>
          <Text className="text-ui-fg-subtle" size="small">
            {t("marketplaces.desk.subtitle")}
          </Text>
        </div>

        {/* Одно предложение о том, чего экран НЕ делает. Текст приезжает с
            бэкенда, чтобы API и экран говорили покупателю одно и то же. */}
        <div className="px-6 pb-4">
          <Alert variant="info">
            {desk ? desk.sending.reason : t("marketplaces.desk.sendingOff")}
          </Alert>
        </div>
      </Container>

      <Container className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-ui-border-base px-6 py-4">
          {(["reviews", "questions"] as const).map((which) => (
            <Button
              key={which}
              size="small"
              variant={kind === which ? "primary" : "secondary"}
              onClick={() => setKind(which)}
            >
              {t(`marketplaces.desk.tabs.${which}`)} · {tabCount(which)}
            </Button>
          ))}

          {desk ? (
            <Text className="text-ui-fg-subtle ml-auto" size="small">
              {t("marketplaces.desk.unansweredOf", {
                unanswered: desk.counts[kind].unanswered,
                total: desk.counts[kind].total,
              })}
            </Text>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <label className="flex flex-col gap-y-1">
            <Text className="text-ui-fg-subtle" size="xsmall">
              {t("marketplaces.desk.filters.marketplace")}
            </Text>
            <Select
              size="small"
              value={query.marketplace ?? ANY}
              onValueChange={(value) =>
                setQuery((prev) => ({ ...prev, marketplace: value === ANY ? null : value }))
              }
            >
              <Select.Trigger className="w-48">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ANY}>{t("marketplaces.desk.filters.any")}</Select.Item>
                {(desk?.marketplaces ?? []).map((id) => (
                  <Select.Item key={id} value={id}>
                    {marketplaceLabel(id)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </label>

          {/* У вопроса нет оценки, поэтому на вкладке «Вопросы» этого фильтра
              нет — и бэкенд его там тоже не применяет. */}
          {kind === "reviews" ? (
            <label className="flex flex-col gap-y-1">
              <Text className="text-ui-fg-subtle" size="xsmall">
                {t("marketplaces.desk.filters.rating")}
              </Text>
              <Select
                size="small"
                value={query.rating ? String(query.rating) : ANY}
                onValueChange={(value) =>
                  setQuery((prev) => ({
                    ...prev,
                    rating: value === ANY ? null : Number.parseInt(value, 10),
                  }))
                }
              >
                <Select.Trigger className="w-40">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value={ANY}>{t("marketplaces.desk.filters.any")}</Select.Item>
                  {RATINGS.map((rating) => (
                    <Select.Item key={rating} value={String(rating)}>
                      {t("marketplaces.desk.filters.stars", { count: rating })}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </label>
          ) : null}

          <label className="flex flex-col gap-y-1">
            <Text className="text-ui-fg-subtle" size="xsmall">
              {t("marketplaces.desk.filters.answered")}
            </Text>
            <Select
              size="small"
              value={query.answered ?? "all"}
              onValueChange={(value) =>
                setQuery((prev) => ({ ...prev, answered: value as DeskQuery["answered"] }))
              }
            >
              <Select.Trigger className="w-48">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {(["all", "no", "yes"] as const).map((value) => (
                  <Select.Item key={value} value={value}>
                    {t(`marketplaces.desk.filterValues.answered.${value}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </label>

          <label className="flex flex-col gap-y-1">
            <Text className="text-ui-fg-subtle" size="xsmall">
              {t("marketplaces.desk.filters.period")}
            </Text>
            <Select
              size="small"
              value={query.period ?? "all"}
              onValueChange={(value) => setQuery((prev) => ({ ...prev, period: value }))}
            >
              <Select.Trigger className="w-48">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {PERIODS.map((value) => (
                  <Select.Item key={value} value={value}>
                    {t(`marketplaces.desk.filterValues.period.${value}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </label>

          {desk?.filters.applied.length ? (
            <Button
              size="small"
              variant="transparent"
              onClick={() =>
                setQuery({ marketplace: null, rating: null, answered: "all", period: "all" })
              }
            >
              {t("marketplaces.desk.filters.reset")}
            </Button>
          ) : null}
        </div>

        {/* Состояние генератора черновиков — одной строкой на экран, а не под
            каждой карточкой: кнопка «Сгенерировать» отключена, и причина
            должна стоять рядом ровно один раз (правило 18e). */}
        {desk ? (
          <div className="border-t border-ui-border-base px-6 py-3">
            <Text
              className={desk.generator.available ? "text-ui-fg-subtle" : "text-ui-fg-muted"}
              size="xsmall"
            >
              {t(
                desk.generator.available
                  ? "marketplaces.desk.generatorOn"
                  : "marketplaces.desk.generatorOff"
              )}
            </Text>
            {/* The backend's own reason names a setting of the server; it is
                for support, not for the owner (o21-owner-panel-ux, P3). */}
            <SupportDetails text={desk.generator.reason} />
          </div>
        ) : null}
      </Container>

      {isPending || !desk ? (
        <Container className="p-0">
          <div className="px-6 py-6">
            <Text className="text-ui-fg-subtle" size="small">
              {t("marketplaces.loading")}
            </Text>
          </div>
        </Container>
      ) : desk.items.length === 0 ? (
        <Container className="p-0">
          <div className="flex flex-col gap-y-2 px-6 py-6">
            <Text size="small">{emptyReason}</Text>
            {desk.counts[kind].total === 0 ? (
              <Text className="text-ui-fg-subtle" size="small">
                {t("marketplaces.desk.emptyImportHint")}
              </Text>
            ) : null}
          </div>
        </Container>
      ) : (
        <>
          {desk.items.map((item) => (
            <DeskItemCard key={item.id} item={item} generator={desk.generator} />
          ))}

          {desk.count > desk.items.length ? (
            <Container className="p-0">
              <div className="px-6 py-4">
                <Badge size="2xsmall">
                  {t("marketplaces.desk.shownOf", {
                    shown: desk.items.length,
                    count: desk.count,
                  })}
                </Badge>
              </div>
            </Container>
          ) : null}
        </>
      )}
    </SingleColumnPage>
  )
}
