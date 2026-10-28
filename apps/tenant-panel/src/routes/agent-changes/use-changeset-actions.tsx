import { ArrowUpCircleSolid, ArrowUturnLeft, Eye, XCircle } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  useAgentChangesetAction,
  type AgentChangesetSummary,
  type ChangesetAction,
} from "../../hooks/api/agent-changesets"
import { CONFIRMED_ACTIONS, changesetActions, changesetWhat } from "./labels"

// t-2026-10-27-04: the moves of one changeset, shared by the row's «…» and the
// card's footer. «Опубликовать», «Откатить» and «Отменить» ask first and name
// what they touch; a refusal from the server (the live site changed, a target
// is gone) shows its own message and changes nothing.

export const ACTION_ICON: Record<ChangesetAction, ReactNode> = {
  stage: <Eye />,
  publish: <ArrowUpCircleSolid />,
  rollback: <ArrowUturnLeft />,
  discard: <XCircle />,
}

export const useChangesetActions = (changeset: Pick<AgentChangesetSummary, "id" | "status" | "summary" | "op_kinds">) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const action = useAgentChangesetAction(changeset.id)

  const run = async (move: ChangesetAction) => {
    if (CONFIRMED_ACTIONS.includes(move)) {
      const confirmed = await prompt({
        title: t(`agentChanges.confirm.${move}.title`),
        description: t(`agentChanges.confirm.${move}.description`, { what: changesetWhat(t, changeset) }),
        confirmText: t(`agentChanges.actions.${move}`),
        cancelText: t("actions.cancel"),
        variant: move === "publish" ? "confirmation" : "danger",
      })
      if (!confirmed) return
    }
    try {
      await action.mutateAsync(move)
      toast.success(t(`agentChanges.toasts.${move}`))
    } catch (error) {
      const status = (error as { status?: number }).status
      toast.error(
        status === 409 && move === "rollback"
          ? t("agentChanges.drift.toast")
          : (error as Error).message
      )
    }
  }

  return {
    moves: changesetActions(changeset.status),
    run,
    isPending: action.isPending,
  }
}
