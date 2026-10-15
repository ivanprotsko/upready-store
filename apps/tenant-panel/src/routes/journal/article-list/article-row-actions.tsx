import { ArrowUpRightOnBox, PencilSquare, Trash } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import { useDeleteTenantArticle } from "../../../hooks/api/articles"
import type { ArticleGroup } from "./article-groups"

// t10-blog: delete is the only destructive action on this screen, so it asks
// first and says exactly what disappears — every language of the article, not
// just the one the row happens to show.
//
// t-2026-10-14-01 (panel redesign, G4): the same three actions, in the
// catalogue's words; delete stands last, after the separator, in the error
// colour (panel-ds E6).

export const ArticleRowActions = ({
  group,
  href,
}: {
  group: ArticleGroup
  /** The article's address on the storefront, with the scheme; none before the shop has a host. */
  href?: string
}) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: deleteArticle } = useDeleteTenantArticle(group.slug)

  const handleDelete = async () => {
    const confirmed = await prompt({
      title: t("journal.deletePrompt.title"),
      description: t("journal.deletePrompt.description", {
        title: group.primary.title.trim() || group.slug,
        locales: group.locales.map((row) => row.locale).join(", "),
      }),
      confirmText: t("journal.deletePrompt.confirm"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })

    if (!confirmed) {
      return
    }

    await deleteArticle(undefined, {
      onSuccess: () => toast.success(t("journal.toast.deleted")),
      onError: (error) => toast.error(error.message),
    }).catch(() => undefined)
  }

  // b18-blog-full: «открыть на сайте» is offered only for an article a visitor
  // can actually open — a link to a draft is a 404 with the owner's own name on
  // it. `published` is computed by the backend, so a scheduled article that is
  // already due counts as open (rule 20 — one definition of «visible»).
  const openOnSite = href && group.locales.some((row) => row.published)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("journal.actions.edit"),
              to: `/journal/${group.slug}`,
            },
            ...(openOnSite
              ? [
                  {
                    icon: <ArrowUpRightOnBox />,
                    label: t("journal.actions.openOnSite"),
                    onClick: () => window.open(href, "_blank", "noreferrer"),
                  },
                ]
              : []),
          ],
        },
        {
          actions: [
            {
              icon: <Trash />,
              label: t("journal.actions.delete"),
              destructive: true,
              onClick: handleDelete,
            },
          ],
        },
      ]}
    />
  )
}
