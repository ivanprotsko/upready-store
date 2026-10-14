import { FetchError } from "@medusajs/js-sdk"

import { useStaff } from "../../../hooks/api/staff"

// t-2026-10-14-01 (panel redesign, G2): one login for the card and its edit
// drawer. The backend has no `GET /tenants/staff/:id`; the list already holds
// every login of the shop and the roles, so the card reads it from there and
// shares its cache with the list (one request, refreshed by every change).

export const useStaffMember = (id: string | undefined) => {
  const { staff, roles, isPending, isError, error } = useStaff()
  const member = staff?.find((row) => row.id === id)

  // A login removed a moment ago, or an address typed by hand: «не найдено».
  const missing = !isPending && !isError && !!staff && !member
  return {
    member,
    roles,
    isPending,
    isError: isError || missing,
    error: missing ? new FetchError("Staff member not found", "Not Found", 404) : error,
  }
}
