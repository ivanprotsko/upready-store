import { UIMatch } from "react-router-dom"

import { staffName } from "../../../../lib/staff"
import { useStaffMember } from "../use-staff-member"

// The crumb of the card is the person: «Настройки / Сотрудники / Имя Фамилия»,
// the address when the login has no name.
export const StaffDetailBreadcrumb = (props: UIMatch) => {
  const { member } = useStaffMember(props.params?.id)

  if (!member) {
    return null
  }

  return <span>{staffName(member) || member.email}</span>
}
