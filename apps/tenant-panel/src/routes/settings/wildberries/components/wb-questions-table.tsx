import { Badge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbTablesResponse } from "../../../../hooks/api/wb-tables"

const NOT_SET = "—"

/**
 * Customer questions about the shop's listings
 * (w03-wb-sales-questions-mirror).
 *
 * Unanswered first, because that is the only thing on this screen that is
 * waiting for the owner. Answering happens in the WB cabinet: the answering
 * method is a PATCH and this platform cannot send one (see the registry on
 * this same page), so there is no button here and the screen says why.
 */
export const WbQuestionsTable = ({
  questions,
}: {
  questions: WbTablesResponse["questions"]
}) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const dateTime = (value: string | null): string => {
    if (!value) {
      return NOT_SET
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.questions.unanswered")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {questions.unanswered}
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.questions.answered")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {questions.answered}
          </Text>
        </div>
      </div>

      {questions.rows.length ? (
        <div className="overflow-x-auto">
          <table className="txt-compact-small w-full min-w-[720px] text-left">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-normal">{t("wildberries.questions.state")}</th>
                <th className="py-2 pr-4 font-normal">{t("wildberries.questions.when")}</th>
                <th className="py-2 pr-4 font-normal">{t("wildberries.questions.item")}</th>
                <th className="py-2 font-normal">{t("wildberries.questions.text")}</th>
              </tr>
            </thead>
            <tbody>
              {questions.rows.map((row) => (
                <tr
                  key={row.question_id}
                  className="border-ui-border-base border-b last:border-b-0 align-top"
                >
                  <td className="py-2 pr-4">
                    <Badge color={row.is_answered ? "grey" : "orange"} size="2xsmall">
                      {row.is_answered
                        ? t("wildberries.questions.isAnswered")
                        : t("wildberries.questions.isWaiting")}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{dateTime(row.created_date)}</td>
                  <td className="py-2 pr-4">
                    <div>{row.product_name ?? NOT_SET}</div>
                    <div className="text-ui-fg-subtle font-mono">
                      {row.supplier_article ?? row.nm_id ?? NOT_SET}
                    </div>
                  </td>
                  <td className="py-2">
                    <div>{row.text ?? NOT_SET}</div>
                    {row.answer_text ? (
                      <div className="text-ui-fg-subtle mt-1">
                        {t("wildberries.questions.answerPrefix")} {row.answer_text}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.questions.empty")}
        </Text>
      )}
    </div>
  )
}
