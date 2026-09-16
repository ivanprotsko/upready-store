import { Badge, Button, Select, Text, Textarea } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type {
  WbAnswerItem,
  WbAnswerTemplate,
} from "../../../../hooks/api/wb-feedback-answers"

/**
 * One review or one question, with the draft the owner is writing for it
 * (w22-wb-write-feedback-answers).
 *
 * The card keeps the textarea's value in its own state while she types, and
 * the server keeps the truth. Two rules that state follows, both of them the
 * reason this is a component and not an inline block:
 *
 * - the draft the SERVER holds only overwrites the textarea while she has not
 *   touched it (`touchedRef`). A save answers with the whole page, and a bare
 *   `setDraft(server)` in that continuation would wipe what she typed while
 *   the request was in flight (rule 19h);
 * - «Подтвердить и отправить» SAVES first and then confirms what came back.
 *   The confirmation hashes the stored text, so what she approves in the
 *   dialog and what the backend sends are the same string by construction.
 *
 * Design system: @medusajs/ui, like every other screen of this panel — the
 * divergence from the Geist canon is the one w01's report records, not a new
 * one.
 */

const NOT_SET = "—"

const formatDate = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleDateString(locale)
}

const STATUS_COLOR: Record<string, "grey" | "orange" | "green" | "red"> = {
  draft: "grey",
  confirmed: "orange",
  sent: "green",
  failed: "red",
}

export const WbAnswerCard = ({
  item,
  templates,
  maxChars,
  busy,
  canAnswer,
  answerDisabledReason,
  onSave,
  onSend,
  onMarkViewed,
}: {
  item: WbAnswerItem
  templates: WbAnswerTemplate[]
  maxChars: number
  busy: boolean
  /** `false` when this kind of item has no registered answer mutation. */
  canAnswer: boolean
  /** Why not, in the owner's words. Rendered instead of the button. */
  answerDisabledReason: string | null
  onSave: (text: string) => Promise<void>
  onSend: (text: string) => Promise<void>
  onMarkViewed: (() => Promise<void>) | null
}) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const [draft, setDraft] = useState(item.draft_answer ?? "")
  const touchedRef = useRef(false)

  // The server's value is the BASELINE and may always refresh it; the DRAFT
  // she is typing may not be replaced (rule 19h). `item.id` in the deps is
  // what makes a re-sorted list hand the right text to the right card.
  useEffect(() => {
    if (!touchedRef.current) {
      setDraft(item.draft_answer ?? "")
    }
  }, [item.id, item.draft_answer])

  const applyTemplate = (slug: string) => {
    const template = templates.find((candidate) => candidate.slug === slug)
    if (!template) {
      return
    }
    touchedRef.current = true
    // Replacing, not appending: the picker is "start from this", and an
    // append would quietly build a letter out of three templates.
    setDraft(template.body)
  }

  const usable = templates.filter(
    (template) => template.target === "both" || template.target === item.target
  )

  const answered = item.is_answered || item.answer_status === "sent"

  return (
    <div
      className="border-ui-border-base flex flex-col gap-y-3 border-b pb-4 last:border-b-0 last:pb-0"
      data-testid={`wb-answer-${item.target}-${item.id}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Badge size="2xsmall" color={answered ? "green" : "orange"}>
          {answered
            ? t("wildberries.answers.answered")
            : t("wildberries.answers.unanswered")}
        </Badge>
        {item.rating === null ? null : (
          <Text size="small" weight="plus" className="tabular-nums">
            {t("wildberries.answers.rating", { value: item.rating })}
          </Text>
        )}
        <Text size="small" className="text-ui-fg-subtle">
          {formatDate(item.created_date, locale)}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {item.product_title ??
            item.vendor_code ??
            (item.nm_id
              ? t("wildberries.answers.byNmId", { nmId: item.nm_id })
              : t("wildberries.answers.noProduct"))}
        </Text>
        {item.answer_status === "draft" ? null : (
          <Badge size="2xsmall" color={STATUS_COLOR[item.answer_status] ?? "grey"}>
            {t(`wildberries.answers.statuses.${item.answer_status}`, {
              defaultValue: item.answer_status,
            })}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-y-1">
        <Text size="small">{item.text || t("wildberries.answers.noText")}</Text>
        {item.pros ? (
          <Text size="small" className="text-ui-fg-subtle">
            {t("wildberries.answers.pros", { text: item.pros })}
          </Text>
        ) : null}
        {item.cons ? (
          <Text size="small" className="text-ui-fg-subtle">
            {t("wildberries.answers.cons", { text: item.cons })}
          </Text>
        ) : null}
        {item.answer_text ? (
          <Text size="small" className="text-ui-fg-subtle">
            {t("wildberries.answers.existingAnswer", { text: item.answer_text })}
          </Text>
        ) : null}
      </div>

      <div className="flex flex-col gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs">
            <Select onValueChange={applyTemplate} disabled={busy || answered}>
              <Select.Trigger>
                <Select.Value placeholder={t("wildberries.answers.templatePlaceholder")} />
              </Select.Trigger>
              <Select.Content>
                {usable.map((template) => (
                  <Select.Item key={template.slug} value={template.slug}>
                    {template.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Text size="small" className="text-ui-fg-subtle tabular-nums">
            {/* `used`, not `count`: i18next reserves `count` for plural selection,
                and a key with no plural forms would go looking for `chars_other`. */}
            {t("wildberries.answers.chars", { used: draft.length, max: maxChars })}
          </Text>
        </div>

        <Textarea
          value={draft}
          rows={3}
          maxLength={maxChars}
          disabled={busy || answered}
          placeholder={t("wildberries.answers.draftPlaceholder")}
          onChange={(event) => {
            touchedRef.current = true
            setDraft(event.target.value)
          }}
        />

        {item.answer_error ? (
          <Text size="small" className="text-ui-fg-error">
            {item.answer_error}
          </Text>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            disabled={busy || answered}
            onClick={async () => {
              await onSave(draft)
              touchedRef.current = false
            }}
          >
            {t("wildberries.answers.save")}
          </Button>

          {canAnswer ? (
            <Button
              size="small"
              variant="primary"
              disabled={busy || answered || !draft.trim()}
              onClick={async () => {
                await onSend(draft)
                touchedRef.current = false
              }}
            >
              {t("wildberries.answers.send")}
            </Button>
          ) : (
            // The real control is not rendered at all, and a pointer stands
            // where it would have been: a disabled button with no explanation
            // is the thing the owner would file a bug about. The full reason is
            // the banner at the top of the tab — repeating it on all 50 cards
            // would bury the reviews it is written next to.
            <Text
              size="small"
              className="text-ui-fg-subtle max-w-xl"
              title={answerDisabledReason ?? undefined}
            >
              {t("wildberries.answers.cannotAnswer")}
            </Text>
          )}

          {onMarkViewed ? (
            <Button
              size="small"
              variant="transparent"
              disabled={busy || item.was_viewed === true}
              onClick={() => onMarkViewed()}
            >
              {item.was_viewed === true
                ? t("wildberries.answers.alreadyViewed")
                : t("wildberries.answers.markViewed")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
