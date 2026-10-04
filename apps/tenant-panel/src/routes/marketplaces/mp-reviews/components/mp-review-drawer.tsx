import { Badge, Button, Drawer, Text, Textarea, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SupportDetails } from "../../../../components/common/support-details"
import {
  useSaveDraft,
  useSuggestDraft,
  type DeskGenerator,
  type DeskItem,
} from "../../../../hooks/api/marketplace-desk"
import { MP_FIXTURES } from "../../../../hooks/api/marketplace-section"
import { useDate } from "../../../../hooks/use-date"

/**
 * One review or question with its draft reply (mp-section-design). Opened
 * from the row; the table behind it stays where it was. The draft is saved to
 * our base and nowhere else (`POST /tenants/marketplaces/{kind}/:id/draft`),
 * which the one sentence under the field says, word for word as the backend
 * sends it. After a save the lists are refetched, so the row's dot turns
 * «Черновик ответа» and the «сохранён …» line below comes from the base.
 *
 * «Сгенерировать» is disabled when the backend has no generator, and the
 * drawer says so once: the plain sentence on the screen, the backend's own
 * reason (a variable name) under «Подробности для поддержки» (P3).
 */
export const MpReviewDrawer = ({
  item,
  generator,
  readOnlyNote,
  onClose,
}: {
  item: DeskItem
  generator: DeskGenerator | undefined
  readOnlyNote: string
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const [draft, setDraft] = useState(item.answer_draft ?? "")
  const generatorAvailable = MP_FIXTURES || (generator?.available ?? false)

  const save = useSaveDraft({
    onSuccess: () => toast.success(t("marketplaces.desk.draft.saved")),
    onError: (error) => toast.error(error.message),
  })
  const suggest = useSuggestDraft({
    onSuccess: ({ draft: generated }) => {
      setDraft(generated)
      toast.success(t("marketplaces.desk.draft.generated"))
    },
    onError: (error) => toast.error(error.message),
  })

  const onSave = () => {
    if (MP_FIXTURES) {
      toast.success(t("marketplaces.desk.draft.saved"))
      return
    }
    save.mutate({ kind: item.kind, id: item.id, answer_draft: draft })
  }
  const onSuggest = () => {
    if (MP_FIXTURES) {
      setDraft(
        "Здравствуйте! Спасибо, что поделились впечатлением. Замечание по упаковке передали на склад, в следующий раз упакуем надёжнее."
      )
      toast.success(t("marketplaces.desk.draft.generated"))
      return
    }
    suggest.mutate({ kind: item.kind, id: item.id })
  }

  return (
    <Drawer open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            {item.kind === "questions" ? t("mp.kind.question") : t("mp.kind.review")}
          </Drawer.Title>
          <Drawer.Description>
            {item.author ?? t("marketplaces.desk.anonymous")}
            {item.created_at ? ` · ${getFullDate({ date: item.created_at, includeTime: true })}` : ""}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-5 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            {item.rating !== null ? (
              <Badge size="2xsmall" color={item.rating >= 4 ? "green" : "orange"}>
                {t("marketplaces.desk.filters.stars", { count: item.rating })}
              </Badge>
            ) : null}
            <Badge size="2xsmall" color={item.is_answered ? "green" : "red"}>
              {item.is_answered ? t("mp.answer.answered") : t("mp.answer.open")}
            </Badge>
          </div>

          <div className="flex flex-col gap-y-1">
            <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
              {t("fields.product")}
            </Text>
            {item.product.linked && item.product.product_id ? (
              <Link
                to={`/products/${item.product.product_id}`}
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
              >
                {item.product.product_title ?? item.product.product_id}
              </Link>
            ) : (
              <Text size="small">
                {item.product.mp_title ?? "—"}
                <span className="text-ui-fg-subtle"> · {t("marketplaces.desk.notInShop")}</span>
              </Text>
            )}
          </div>

          <div className="flex flex-col gap-y-2">
            {item.text ? <Text size="small">{item.text}</Text> : null}
            {!item.text && !item.pros && !item.cons ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("mp.reviews.noText")}
              </Text>
            ) : null}
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
          </div>

          <div className="flex flex-col gap-y-2">
            <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
              {t("marketplaces.desk.draft.label")}
            </Text>
            <Textarea
              rows={5}
              value={draft}
              placeholder={t("marketplaces.desk.draft.placeholder")}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Text size="xsmall" className="text-ui-fg-muted">
              {readOnlyNote}
            </Text>
            {item.answer_draft_at ? (
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("marketplaces.desk.draft.savedAt", {
                  at: getFullDate({ date: item.answer_draft_at, includeTime: true }),
                })}
              </Text>
            ) : null}
            {!generatorAvailable && generator ? (
              <div className="flex flex-col gap-y-1" data-testid="mp-review-generator-off">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("mp.reviews.generatorOff")}
                </Text>
                <SupportDetails text={generator.reason} />
              </div>
            ) : null}
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Button
            size="small"
            variant="secondary"
            disabled={!generatorAvailable}
            isLoading={suggest.isPending}
            onClick={onSuggest}
          >
            {t("marketplaces.desk.draft.generate")}
          </Button>
          <Button size="small" isLoading={save.isPending} onClick={onSave}>
            {t("marketplaces.desk.draft.save")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
