import { Navigate, useParams } from "react-router-dom"

import { staffRowActions } from "../../../lib/staff"
import { StaffDrawer } from "./staff-drawer"
import { useStaffMember } from "./use-staff-member"

// t-2026-10-14-01 (panel redesign, G2, prototype state `staff-edit`): the
// «Изменить» of a login, on `/settings/staff/:id/edit` over its card. The
// platform developer's login has no form in the shop: its address leads back
// to the card, which says why.

export const StaffEdit = () => {
  const { id } = useParams()
  const { member, roles, isPending, isError, error } = useStaffMember(id)

  if (isError) {
    throw error
  }

  if (member && !staffRowActions(member).canEdit) {
    return <Navigate to=".." replace />
  }

  return (
    <StaffDrawer
      key={member?.id}
      mode="edit"
      member={member}
      roles={roles}
      isPending={isPending || !member}
    />
  )
}

export { StaffEdit as Component }
