import { useStaff } from "../../../hooks/api/staff"
import { StaffDrawer } from "./staff-drawer"

// t-2026-10-14-01 (panel redesign, G2, prototype state `staff-create`):
// «Добавить сотрудника» opens this drawer on `/settings/staff/create`, over
// the list. It waits for the list, which brings the roles the select offers.

export const StaffCreate = () => {
  const { roles, isPending, isError, error } = useStaff()

  if (isError) {
    throw error
  }

  return <StaffDrawer mode="create" roles={roles} isPending={isPending} />
}

export { StaffCreate as Component }
