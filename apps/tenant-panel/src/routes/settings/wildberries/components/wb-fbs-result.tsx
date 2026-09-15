import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbFbsActionResponse } from "../../../../hooks/api/wb-fbs-orders"

/**
 * What an action actually did (w23-wb-write-fbs-orders).
 *
 * The evidence half of the desk. Every step is either a journalled dry run,
 * with the fingerprint of the payload that WOULD have been sent, or a refusal
 * naming the gate that stopped it. Nothing here is phrased as a promise: the
 * words come from the answer, and the same rows stand in the audit table on
 * the connection tab, where they can be read back afterwards.
 */
export const WbFbsResult = ({ result }: { result: WbFbsActionResponse }) => {
  const { t } = useTranslation()

  return (
    <div className="bg-ui-bg-subtle flex flex-col gap-y-2 rounded-lg px-4 py-3">
      <Text size="small" weight="plus">
        {result.dry_run ? t("wildberries.fbs.result.dryRun") : t("wildberries.fbs.result.sent")}
      </Text>

      {result.steps.map((step, index) => (
        <div key={`${step.endpoint_id}-${index}`} className="flex flex-col">
          <Text size="small" className="font-mono">
            {step.refused ? step.endpoint_id : `${step.method} ${step.path}`}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {step.refused
              ? t("wildberries.fbs.result.refusedAt", {
                  gate: t(`wildberries.write.gates.${step.gate}`, {
                    defaultValue: step.gate ?? "",
                  }),
                  message: step.message ?? "",
                })
              : t("wildberries.fbs.result.journalled", {
                  sha: (step.payload_sha256 ?? "").slice(0, 12),
                })}
          </Text>
        </div>
      ))}

      {result.note ? (
        <Text size="small" className="text-ui-fg-subtle">
          {result.note}
        </Text>
      ) : null}
    </div>
  )
}
