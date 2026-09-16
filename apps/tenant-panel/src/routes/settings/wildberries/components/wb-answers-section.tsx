import { Alert, Badge, Button, Tabs, Text, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  useSaveWbAnswerDraft,
  useSendWbAnswer,
  useWbFeedbackAnswers,
  type WbAnswerBucket,
  type WbAnswerFilter,
  type WbAnswerItem,
  type WbAnswerTarget,
  type WbFeedbackAnswersResponse,
} from "../../../../hooks/api/wb-feedback-answers"
import { WbAnswerCard } from "./wb-answer-card"
import { WbAnswerCounts } from "./wb-answer-counts"

/**
 * «Отзывы и вопросы» — the tab where the owner writes her answers
 * (w22-wb-write-feedback-answers).
 *
 * Nothing on this screen sends anything to Wildberries today, and the screen
 * says so at the top rather than after the button is pressed: the live gate
 * `WB_WRITE_LIVE` is set by no deployment, so a confirmed answer becomes one
 * row in the write journal with `dry_run = true`. The banner reads the gate
 * from the backend, so it stops saying that on the day the gate opens.
 *
 * The flow behind «Подтвердить и отправить», in order:
 *
 *   1. the draft is SAVED, so the server holds the exact text;
 *   2. the dialog quotes what came back from that save;
 *   3. the send carries the sha256 of that stored text, and the backend
 *      recomputes it before it asks the write core for anything.
 *
 * Step 3 is the per-answer consent of Ivan's order of 2026-09-16 04:44 WITA,
 * on top of the per-class consent of w20 — and it is a comparison rather than
 * a flag, so "she confirmed it" means "she confirmed THIS text".
 *
 * Design system: @medusajs/ui, like the rest of this page.
 */

const FILTERS: WbAnswerFilter[] = ["unanswered", "answered", "all"]

export const WbAnswersSection = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const [filter, setFilter] = useState<WbAnswerFilter>("unanswered")
  const { answers, isPending, isError, error } = useWbFeedbackAnswers(filter)
  const { mutateAsync: saveDraft, isPending: isSaving } = useSaveWbAnswerDraft(filter)
  const { mutateAsync: send, isPending: isSending } = useSendWbAnswer(filter)

  if (isError) {
    throw error
  }

  const busy = isSaving || isSending

  const questionGap = answers?.unregistered.find(
    (entry) => entry.what === "questions.answer"
  )

  const saveOne = async (item: WbAnswerItem, text: string) => {
    try {
      await saveDraft({ target: item.target, id: item.id, draft_answer: text })
      toast.success(t("wildberries.answers.savedToast"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const sendOne = async (item: WbAnswerItem, text: string) => {
    let state: WbFeedbackAnswersResponse
    try {
      // The save is part of the send: the dialog must quote the text the
      // SERVER holds, not the one this component is holding in state.
      state = await saveDraft({ target: item.target, id: item.id, draft_answer: text })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return
    }

    const bucket = item.target === "feedback" ? state.feedbacks : state.questions
    const saved = bucket.rows.find((row) => row.id === item.id)

    if (!saved?.draft_sha256 || !saved.draft_answer) {
      toast.error(t("wildberries.answers.noDraftToast"))
      return
    }

    const confirmed = await prompt({
      title: t("wildberries.answers.confirm.title"),
      description: t("wildberries.answers.confirm.body", {
        text: saved.draft_answer,
        mode: state.gates.live.enabled
          ? t("wildberries.answers.confirm.live")
          : t("wildberries.answers.confirm.dryRun", { env: state.gates.live.env_var }),
      }),
      confirmText: t("wildberries.answers.confirm.ok"),
      cancelText: t("wildberries.answers.confirm.cancel"),
    })

    if (!confirmed) {
      return
    }

    try {
      const answer = await send({
        target: item.target,
        id: item.id,
        intent: "answer",
        // The hash of what the dialog just quoted. The backend recomputes it
        // over the stored draft and refuses on a mismatch.
        answer_sha256: saved.draft_sha256,
      })
      toast.success(answer.result.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const markViewed = async (item: WbAnswerItem) => {
    try {
      const answer = await send({ target: item.target, id: item.id, intent: "view" })
      toast.success(answer.result.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const renderBucket = (target: WbAnswerTarget, bucket: WbAnswerBucket) => {
    if (!bucket.rows.length) {
      return (
        <Text size="small" className="text-ui-fg-subtle">
          {t("wildberries.answers.empty")}
        </Text>
      )
    }

    return (
      <div className="flex flex-col gap-y-4">
        {bucket.rows.map((row) => (
          <WbAnswerCard
            key={`${row.target}:${row.id}`}
            item={row}
            templates={answers?.templates ?? []}
            maxChars={answers?.limits.max_chars ?? 5000}
            busy={busy}
            canAnswer={target === "feedback"}
            answerDisabledReason={questionGap?.reason ?? null}
            onSave={(text) => saveOne(row, text)}
            onSend={(text) => sendOne(row, text)}
            onMarkViewed={target === "question" ? () => markViewed(row) : null}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4" data-testid="wb-answers-section">
      <div>
        <Text weight="plus">{t("wildberries.answers.title")}</Text>
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.answers.hint")}
        </Text>
      </div>

      {isPending || !answers ? (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.loading")}
        </Text>
      ) : (
        <>
          {answers.gates.live.enabled ? (
            <Alert variant="warning">
              {t("wildberries.answers.liveOn", { env: answers.gates.live.env_var })}
            </Alert>
          ) : (
            <Alert variant="info">
              {t("wildberries.answers.liveOff", { env: answers.gates.live.env_var })}
            </Alert>
          )}

          {answers.gates.consent ? null : (
            <Alert variant="warning">{t("wildberries.answers.noConsent")}</Alert>
          )}

          {questionGap ? (
            <Alert variant="info">
              {t("wildberries.answers.questionGap", {
                method: questionGap.method,
                path: questionGap.path,
                reason: questionGap.reason,
              })}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((value) => (
              <Button
                key={value}
                size="small"
                variant={filter === value ? "secondary" : "transparent"}
                onClick={() => setFilter(value)}
              >
                {t(`wildberries.answers.filters.${value}`)}
              </Button>
            ))}
          </div>

          <Tabs defaultValue="feedbacks">
            <Tabs.List>
              <Tabs.Trigger value="feedbacks">
                {t("wildberries.answers.tabs.feedbacks")}
                <Badge size="2xsmall" className="ml-2">
                  {answers.feedbacks.unanswered}
                </Badge>
              </Tabs.Trigger>
              <Tabs.Trigger value="questions">
                {t("wildberries.answers.tabs.questions")}
                <Badge size="2xsmall" className="ml-2">
                  {answers.questions.unanswered}
                </Badge>
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="feedbacks" className="flex flex-col gap-y-4 pt-4">
              <WbAnswerCounts bucket={answers.feedbacks} />
              {renderBucket("feedback", answers.feedbacks)}
            </Tabs.Content>

            <Tabs.Content value="questions" className="flex flex-col gap-y-4 pt-4">
              <WbAnswerCounts bucket={answers.questions} />
              {renderBucket("question", answers.questions)}
            </Tabs.Content>
          </Tabs>
        </>
      )}
    </div>
  )
}
