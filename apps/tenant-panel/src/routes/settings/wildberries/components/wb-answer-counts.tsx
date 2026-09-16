import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbAnswerBucket } from "../../../../hooks/api/wb-feedback-answers"

/**
 * The three numbers above a list of reviews or questions
 * (w22-wb-write-feedback-answers).
 *
 * They count the WHOLE mirror, not the page: the backend caps the list at 50
 * rows, and "3 из 50" would be a fact about that cap rather than about the
 * shop. `drafts` is the shop's own column, so the row reads "сколько всего,
 * сколько сделано, сколько начато".
 */
export const WbAnswerCounts = ({ bucket }: { bucket: WbAnswerBucket }) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.answers.counts.unanswered")}{" "}
        <span className="text-ui-fg-base tabular-nums">{bucket.unanswered}</span>
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.answers.counts.answered")}{" "}
        <span className="text-ui-fg-base tabular-nums">{bucket.answered}</span>
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.answers.counts.drafts")}{" "}
        <span className="text-ui-fg-base tabular-nums">{bucket.drafts}</span>
      </Text>
    </div>
  )
}
