import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { SettingsDetail, SettingsSection } from "../../../../components/settings"
import { useDate } from "../../../../hooks/use-date"
import {
  StaffMember,
  StaffRoleGrant,
  staffName,
  staffRoleColor,
  staffRoleOf,
  staffRowActions,
} from "../../../../lib/staff"
import { useStaffActions } from "../staff-actions"
import { useRoleSeesList } from "../staff-drawer"
import { useStaffMember } from "../use-staff-member"

// t-2026-10-14-01 (panel redesign, G2, prototype state `staff-detail`): the
// card of one login after panel-ds E2. It only reads: one section with
// the name in its header, the role as a badge next to it and the «…» of the
// row («Изменить» → `edit`, then «Удалить»). The card adds what the table did
// not show: what this role sees, from the same server list as the line under
// the role in the form. After «Удалить» the owner is back on the list.

const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

const StaffCard = ({ member, roles }: { member: StaffMember; roles?: StaffRoleGrant[] }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { getFullDate } = useDate()
  const sees = useRoleSeesList(roles, member.role)
  const actions = useStaffActions(member, {
    onDeleted: () => navigate("/settings/staff", { replace: true }),
  })

  const role = staffRoleOf(member)
  const roleName = role ? t(`staff.roles.${role}`) : member.role

  const general: SettingsSection = {
    id: "general",
    title: staffName(member) || member.email,
    // The platform developer's card has no «…»: it says why instead.
    description: staffRowActions(member).canEdit ? undefined : t("staff.refusals.developer_row"),
    status: { color: staffRoleColor(member.role), label: roleName },
    actions,
    rows: [
      { id: "first-name", label: t("staff.fields.firstName"), value: member.first_name },
      { id: "last-name", label: t("staff.fields.lastName"), value: member.last_name },
      { id: "email", label: t("staff.fields.email"), value: member.email },
      { id: "role", label: t("staff.fields.role"), value: roleName },
      { id: "sees", label: t("staff.detail.sees"), value: sees ? capitalised(sees) : null },
      {
        id: "created",
        label: t("staff.columns.created"),
        value: getFullDate({ date: member.created_at, includeTime: true }),
      },
    ],
  }

  return <SettingsDetail sections={[general]} />
}

export const StaffDetail = () => {
  const { id } = useParams()
  const { member, roles, isPending, isError, error } = useStaffMember(id)

  if (isError) {
    throw error
  }

  if (isPending || !member) {
    return <SettingsDetail sections={[]} isPending />
  }

  return <StaffCard member={member} roles={roles} />
}
