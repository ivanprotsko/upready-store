import {
  ArrowUpRightOnBox,
  ArrowUturnLeft,
  ChatBubbleLeftRight,
  Eye,
  EyeSlash,
  Trash,
} from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { ActionGroup } from "../../components/common/action-menu"
import {
  useDeleteTenantReview,
  useUpdateTenantReview,
  type ReviewStatus,
  type TenantReview,
} from "../../hooks/api/reviews"
import { statusMoves } from "./labels"

// t-2026-10-14-01 (panel redesign, G5, prototype states `reviews-menu`,
// `reviews-delete-prompt`): moderation moved out of the row into one «…».
// The row and the review's drawer read the same groups from here: «Открыть»
// (the row only) and «Ответить», then the status moves this review can make,
// then «Удалить» last, behind a prompt that says how it differs from hiding.

const MOVE_ICON: Record<ReviewStatus, ReactNode> = {
  published: <Eye />,
  hidden: <EyeSlash />,
  pending: <ArrowUturnLeft />,
}

export const useReviewActions = (
  review: TenantReview,
  { onDeleted }: { onDeleted?: () => void } = {}
) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const update = useUpdateTenantReview(review.id)
  const remove = useDeleteTenantReview()

  const setStatus = async (status: ReviewStatus) => {
    try {
      await update.mutateAsync({ status })
      toast.success(t(`reviews.toasts.${status}`))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const deleteReview = async () => {
    const confirmed = await prompt({
      title: t("reviews.delete.title"),
      description: t("reviews.delete.description", { author: review.author_name }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) return
    try {
      await remove.mutateAsync(review.id)
      toast.success(t("reviews.toasts.deleted"))
      onDeleted?.()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  /**
   * The «…» groups. `openTo` is the row's own «Открыть»; the drawer that is
   * already the open review leaves it out, and its «Ответить» is the footer's.
   */
  const groups = ({ openTo, replyTo }: { openTo?: string; replyTo?: string }): ActionGroup[] => [
    {
      actions: [
        ...(openTo ? [{ icon: <ArrowUpRightOnBox />, label: t("reviews.actions.open"), to: openTo }] : []),
        ...(replyTo
          ? [
              {
                icon: <ChatBubbleLeftRight />,
                label: review.reply ? t("reviews.actions.editReply") : t("reviews.actions.reply"),
                to: replyTo,
              },
            ]
          : []),
      ],
    },
    {
      actions: statusMoves(review.status).map((status) => ({
        icon: MOVE_ICON[status],
        label: t(`reviews.actions.${status}`),
        disabled: update.isPending,
        onClick: () => void setStatus(status),
      })),
    },
    {
      actions: [
        {
          icon: <Trash />,
          label: t("actions.delete"),
          destructive: true,
          disabled: remove.isPending,
          onClick: () => void deleteReview(),
        },
      ],
    },
  ]

  return { groups }
}
