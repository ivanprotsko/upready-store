import { Badge, Button, Container, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  useSaveDraft,
  useSuggestDraft,
  type DeskGenerator,
  type DeskItem,
} from "../../../../../hooks/api/marketplace-desk"

/**
 * Одна строка стола: отзыв или вопрос, товар за ним и черновик ответа
 * (w18-mp-reviews-desk).
 *
 * КНОПКИ ОТПРАВКИ ЗДЕСЬ НЕТ. Сохранение пишет черновик в нашу базу и только
 * туда; ответить покупателю владелица идёт в личный кабинет площадки.
 */

const NOT_SET = "—"

const formatDate = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

export const DeskItemCard = ({
  item,
  generator,
}: {
  item: DeskItem
  generator: DeskGenerator
}) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const [draft, setDraft] = useState(item.answer_draft ?? "")

  /**
   * Правка владелицы важнее того, что приедет со следующим ответом сервера:
   * список перезапрашивается после каждого сохранения, и голый `setDraft` в
   * эффекте затирал бы текст, который в этот момент набирают (правило 19h —
   * асинхронная загрузка не владеет состоянием, которого уже касались).
   */
  const touched = useRef(false)

  useEffect(() => {
    if (!touched.current) {
      setDraft(item.answer_draft ?? "")
    }
  }, [item.answer_draft])

  const save = useSaveDraft({
    onSuccess: () => {
      touched.current = false
      toast.success(t("marketplaces.desk.draft.saved"))
    },
    onError: (error) => toast.error(error.message),
  })

  const suggest = useSuggestDraft({
    onSuccess: ({ draft: generated }) => {
      touched.current = true
      setDraft(generated)
      toast.success(t("marketplaces.desk.draft.generated"))
    },
    onError: (error) => toast.error(error.message),
  })

  const marketplace = t(`marketplaces.desk.marketplaceNames.${item.marketplace}`, {
    defaultValue: item.marketplace,
  })

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="2xsmall">{marketplace}</Badge>

          {item.rating !== null ? (
            <Badge size="2xsmall" color={item.rating >= 4 ? "green" : "orange"}>
              {t("marketplaces.desk.filters.stars", { count: item.rating })}
            </Badge>
          ) : null}

          <Badge size="2xsmall" color={item.is_answered ? "grey" : "red"}>
            {item.is_answered
              ? t("marketplaces.desk.answered.yes")
              : t("marketplaces.desk.answered.no")}
          </Badge>

          <Text className="text-ui-fg-subtle" size="small">
            {item.author ?? t("marketplaces.desk.anonymous")} ·{" "}
            {formatDate(item.created_at, locale)}
          </Text>
        </div>

        {/* Товар: сперва товар магазина, если карточка связана; иначе честное
            «нет в магазине» с заголовком карточки площадки, когда он есть. */}
        <Text className="text-ui-fg-subtle" size="small">
          {item.product.linked && item.product.product_id ? (
            <Link
              to={`/products/${item.product.product_id}`}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              {item.product.product_title || item.product.product_id}
            </Link>
          ) : (
            <>
              {t("marketplaces.desk.notInShop")}
              {item.product.mp_title ? ` · ${item.product.mp_title}` : ""}
              {item.product.vendor_code ? ` · ${item.product.vendor_code}` : ""}
            </>
          )}
        </Text>

        {item.text ? <Text size="small">{item.text}</Text> : null}

        {item.pros ? (
          <Text size="small">
            <span className="text-ui-fg-subtle">{t("marketplaces.desk.pros")}: </span>
            {item.pros}
          </Text>
        ) : null}

        {item.cons ? (
          <Text size="small">
            <span className="text-ui-fg-subtle">{t("marketplaces.desk.cons")}: </span>
            {item.cons}
          </Text>
        ) : null}

        <div className="flex flex-col gap-y-2">
          <Text className="text-ui-fg-subtle" size="xsmall">
            {t("marketplaces.desk.draft.label")}
          </Text>

          <Textarea
            rows={3}
            value={draft}
            placeholder={t("marketplaces.desk.draft.placeholder")}
            onChange={(event) => {
              touched.current = true
              setDraft(event.target.value)
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="small"
              isLoading={save.isPending}
              onClick={() => save.mutate({ kind: item.kind, id: item.id, answer_draft: draft })}
            >
              {t("marketplaces.desk.draft.save")}
            </Button>

            {/* Генератора может не быть — тогда кнопка ОТКЛЮЧЕНА и рядом стоит
                причина. Строка не исчезает и не пустеет: «не подключён» это
                состояние, а не отсутствие функции (правило 19h). */}
            <Button
              size="small"
              variant="secondary"
              disabled={!generator.available}
              isLoading={suggest.isPending}
              onClick={() => suggest.mutate({ kind: item.kind, id: item.id })}
            >
              {t("marketplaces.desk.draft.generate")}
            </Button>

            <Text className="text-ui-fg-subtle" size="xsmall">
              {generator.available
                ? item.answer_draft_at
                  ? t("marketplaces.desk.draft.savedAt", {
                      at: formatDate(item.answer_draft_at, locale),
                    })
                  : generator.reason
                : generator.reason}
            </Text>
          </div>

          {!generator.available && item.answer_draft_at ? (
            <Text className="text-ui-fg-subtle" size="xsmall">
              {t("marketplaces.desk.draft.savedAt", {
                at: formatDate(item.answer_draft_at, locale),
              })}
            </Text>
          ) : null}
        </div>
      </div>
    </Container>
  )
}
