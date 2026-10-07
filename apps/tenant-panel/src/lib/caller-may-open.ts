import { meQueryOptions } from "../hooks/api/users"
import { pathAllowed, permissionOfPath, permissionsOf } from "./permissions"
import { queryClient } from "./query-client"

/**
 * Whether the login behind this session may open an address, for the route
 * guard (`lib/route-guard.ts`). It reads the same cached «who am I» answer the
 * screens render from, so a direct visit costs one `GET /tenants/me` and no
 * request to a closed route.
 *
 * A visitor who is not signed in gets `true`: the loader then answers 401 and
 * the error boundary sends them to the login screen, as it did before roles.
 */
export const callerMayOpen = async (pathname: string): Promise<boolean> => {
  if (!permissionOfPath(pathname)) {
    return true
  }
  try {
    const { user } = await queryClient.ensureQueryData(meQueryOptions())
    return pathAllowed(permissionsOf(user), pathname)
  } catch {
    return true
  }
}
