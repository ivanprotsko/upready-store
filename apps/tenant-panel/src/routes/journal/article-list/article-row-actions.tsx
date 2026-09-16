import { ArrowUpRightOnBox, PencilSquare, Trash } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useNavigate } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { useDeleteTenantArticle } from "../../../hooks/api/articles"
import type { ArticleGroup } from "./article-list"

// t10-blog: delete is the only destructive action on this screen, so it asks
// first and says exactly what disappears — every language of the article, not
// just the one the row happens to show.

export const ArticleRowActions = ({
  group,
  publicHost,
}: {
  group: ArticleGroup
  publicHost?: string
}) => {
  const navigate = useNavigate()
  const prompt = usePrompt()
  const { mutateAsync: deleteArticle } = useDeleteTenantArticle(group.slug)

  const handleDelete = async () => {
    const confirmed = await prompt({
      title: "Удалить статью?",
      description: `Статья «${group.primary.title.trim() || group.slug}» и все её тексты (${group.locales
        .map((row) => row.locale)
        .join(", ")}) будут удалены. Её адрес перестанет открываться.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
    })

    if (!confirmed) {
      return
    }

    await deleteArticle(undefined, {
      onSuccess: () => toast.success("Статья удалена"),
      onError: (error) => toast.error(error.message),
    })
  }

  // b18-blog-full: «открыть на сайте» is offered only for an article a visitor
  // can actually open — a link to a draft is a 404 with the owner's own name on
  // it. `published` is computed by the backend, so a scheduled article that is
  // already due counts as open (rule 20 — one definition of «visible»).
  const openOnSite = publicHost && group.locales.some((row) => row.published)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: "Редактировать",
              onClick: () => navigate(group.slug),
            },
            ...(openOnSite
              ? [
                  {
                    icon: <ArrowUpRightOnBox />,
                    label: "Открыть на сайте",
                    onClick: () =>
                      window.open(
                        `${publicHost}/journal/${group.slug}`,
                        "_blank",
                        "noreferrer"
                      ),
                  },
                ]
              : []),
          ],
        },
        {
          actions: [
            {
              icon: <Trash />,
              label: "Удалить",
              onClick: handleDelete,
            },
          ],
        },
      ]}
    />
  )
}
