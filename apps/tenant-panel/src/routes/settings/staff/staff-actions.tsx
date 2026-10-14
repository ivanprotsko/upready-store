import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { IconButton } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ActionGroup, ActionMenu } from "../../../components/common/action-menu"
import { StaffMember, staffRowActions } from "../../../lib/staff"
import { useStaffDelete } from "./use-staff-delete"

// t-2026-10-14-01 (panel redesign, G2): what the «…» of a login offers, the
// same in the list row and on the card (panel-ds E1, E6): «Изменить», then
// «Удалить» after the separator. The caller's own row has no «Удалить», the
// platform developer's row has no «…» at all (`staffRowActions`).

export const useStaffActions = (
  member: StaffMember,
  { onDeleted }: { onDeleted?: () => void } = {}
): ActionGroup[] => {
  const { t } = useTranslation()
  const remove = useStaffDelete()
  const actions = staffRowActions(member)

  if (!actions.canEdit) {
    return []
  }

  const groups: ActionGroup[] = [
    {
      actions: [
        {
          icon: <PencilSquare />,
          label: t("actions.change"),
          to: `/settings/staff/${member.id}/edit`,
        },
      ],
    },
  ]
  if (actions.canDelete) {
    groups.push({
      actions: [
        {
          icon: <Trash />,
          label: t("actions.delete"),
          onClick: async () => {
            if (await remove(member)) {
              onDeleted?.()
            }
          },
        },
      ],
    })
  }
  return groups
}

export const StaffRowActions = ({ member }: { member: StaffMember }) => {
  const { t } = useTranslation()
  const groups = useStaffActions(member)

  if (!groups.length) {
    return null
  }

  return (
    <ActionMenu groups={groups}>
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}
