import { Outlet, useLocation } from "react-router-dom"

import { usePermissions } from "../../../hooks/use-permissions"
import { NoAccess } from "./no-access"

/**
 * The shell's outlet (t-2026-10-07-11): the screen of the open address, or
 * «Нет доступа» when the login's role does not open it. The screen is not
 * mounted in that case, so none of its requests is sent; its loader is held
 * back by `lib/route-guard.ts`.
 */
export const PermissionOutlet = () => {
  const { pathname } = useLocation()
  const { allowed } = usePermissions()

  return allowed(pathname) ? <Outlet /> : <NoAccess />
}
