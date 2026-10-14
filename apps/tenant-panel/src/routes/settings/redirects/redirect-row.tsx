import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { IconButton, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { TenantRedirect, useDeleteTenantRedirect } from "../../../hooks/api/redirects"

// b10-panel-gaps: one rule of the redirect table.
//
// t-2026-10-14-01 (panel redesign, G2, prototype states `redirects-menu` and
// `redirects-edit`): the row no longer edits in its cells. It shows the two
// addresses and the kind; its «…» holds «Изменить» → the drawer
// `/settings/redirects/:id/edit` and, after the separator, «Удалить» behind a
// prompt that names the rule (panel-ds E1, E6, rule 8).

/** The old address on one line; the full address with the shop's host in `title`. */
export const RedirectFromCell = ({
  redirect,
  primaryHost,
}: {
  redirect: TenantRedirect
  /** The shop's main address, so the row shows the full old URL, not a path. */
  primaryHost?: string
}) => (
  <span
    className="block min-w-0 truncate"
    title={primaryHost ? `${primaryHost}${redirect.from_path}` : undefined}
  >
    <Text size="small" leading="compact" className="font-mono truncate">
      {redirect.from_path}
    </Text>
  </span>
)

export const RedirectRowActions = ({ redirect }: { redirect: TenantRedirect }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  // The drawer closes back onto the same search and page of the list.
  const { search } = useLocation()
  const { mutateAsync: remove } = useDeleteTenantRedirect(redirect.id)

  const handleDelete = async () => {
    const confirmed = await prompt({
      title: t("redirects.delete.title"),
      description: t("redirects.delete.description", {
        from: redirect.from_path,
        to: redirect.to_path,
      }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return
    }
    await remove(undefined, {
      onSuccess: () => toast.success(t("redirects.removed")),
      // The backend owns the refusal; its message is what the owner reads.
      onError: (removeError) => toast.error(removeError.message),
    }).catch(() => undefined)
  }

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("actions.change"),
              to: `/settings/redirects/${redirect.id}/edit${search}`,
            },
          ],
        },
        {
          actions: [{ icon: <Trash />, label: t("actions.delete"), onClick: handleDelete }],
        },
      ]}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}
