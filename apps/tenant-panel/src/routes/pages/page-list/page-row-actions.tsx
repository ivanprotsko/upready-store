import { useState } from "react"
import { ArrowDownMini, ArrowUpMini, ArrowUpRightOnBox, PencilSquare, Trash } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ActionMenu, type ActionGroup } from "../../../components/common/action-menu"
import { TenantPage, useDeleteTenantPage } from "../../../hooks/api/pages"
import { footerPages, footerPlace, isSectionKey } from "../page-sections"
import { moveFooterPage } from "./reorder-footer-page"

// t05-page-keys wrote this file as the row of the owner's own page, with a
// bin, an inline «Удалить / Отмена» and two arrows in the «В подвале» cell.
//
// t-2026-10-14-01 (panel redesign, G4, prototype state `pages-menu`): every
// row is a `_DataTable` row now, and what a row can do lives in its «…»
// (panel-ds E1, E6): open the editor, view it on the storefront, move it up or
// down in the footer, and — for the owner's own page only — delete it behind a
// prompt that names the page. The five ready sections cannot be deleted
// (`DELETE /tenants/pages/:key` refuses them), so their menu has no delete.

type PageRowActionsProps = {
  page: TenantPage
  /** Every page of the list, to know the footer around this one. */
  pages: TenantPage[]
  /** The page's address on the storefront, with the scheme; none before the shop has a host. */
  href?: string
}

export const PageRowActions = ({ page, pages, href }: PageRowActionsProps) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const [moving, setMoving] = useState(false)
  const { mutateAsync: deletePage } = useDeleteTenantPage(page.key)

  const place = footerPlace(pages, page.key)
  const last = footerPages(pages).length

  const move = async (direction: "up" | "down") => {
    setMoving(true)
    try {
      await moveFooterPage(pages, page.key, direction)
      toast.success(t("contentPages.toast.moved"))
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : String(moveError))
    } finally {
      setMoving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = await prompt({
      title: t("contentPages.deletePrompt.title"),
      description: t("contentPages.deletePrompt.description", {
        title: page.title.trim() || page.key,
      }),
      confirmText: t("contentPages.deletePrompt.confirm"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return
    }
    await deletePage(undefined, {
      onSuccess: () => toast.success(t("contentPages.toast.deleted")),
      // The backend owns the refusal; its message is what the owner reads.
      onError: (deleteError) => toast.error(deleteError.message),
    }).catch(() => undefined)
  }

  const groups: ActionGroup[] = [
    {
      actions: [
        { icon: <PencilSquare />, label: t("contentPages.actions.open"), to: `/pages/${page.key}` },
        // A link to a draft is a 404 with the shop's name on it.
        ...(href && page.published
          ? [
              {
                icon: <ArrowUpRightOnBox />,
                label: t("contentPages.actions.view"),
                onClick: () => window.open(href, "_blank", "noreferrer"),
              },
            ]
          : []),
      ],
    },
  ]

  if (place !== null) {
    groups.push({
      actions: [
        {
          icon: <ArrowUpMini />,
          label: t("contentPages.actions.up"),
          disabled: moving || place === 1,
          onClick: () => move("up"),
        },
        {
          icon: <ArrowDownMini />,
          label: t("contentPages.actions.down"),
          disabled: moving || place === last,
          onClick: () => move("down"),
        },
      ],
    })
  }

  if (!isSectionKey(page.key)) {
    groups.push({
      actions: [
        {
          icon: <Trash />,
          label: t("contentPages.actions.delete"),
          destructive: true,
          onClick: handleDelete,
        },
      ],
    })
  }

  return <ActionMenu groups={groups} />
}
