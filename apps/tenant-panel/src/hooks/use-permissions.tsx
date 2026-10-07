import { useMemo } from "react"

import { can, pathAllowed, permissionsOf, type Permission } from "../lib/permissions"
import { useMe } from "./api/users"

/**
 * What the signed-in login may open, read from `GET /tenants/me`
 * (t-2026-10-07-11). `can` gates a block and its request, `allowed` gates a
 * link by the address it leads to.
 */
export const usePermissions = () => {
  const { user } = useMe()

  return useMemo(() => {
    const permissions = permissionsOf(user)
    return {
      permissions,
      role: user?.role ?? null,
      can: (permission: Permission) => can(permissions, permission),
      allowed: (to: string) => pathAllowed(permissions, to),
    }
  }, [user])
}
