import { Spinner } from "@medusajs/icons"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useMe } from "../../../hooks/api/users"
import { SidebarProvider } from "../../../providers/sidebar-provider"

// tenant-panel: own version of the Admin's protected-route. Same idle/redirect
// behaviour (spinner while `useMe` loads, redirect to `/login` with
// `state.from` when there is no user, `SidebarProvider` around the outlet),
// without RBAC (no `PermissionsProvider`/`useMePermissions`, since the tenant
// API has no roles or permissions) and without the Admin's `SearchProvider`:
// the panel's ⌘K menu is `CommandMenuProvider`, mounted by the shell
// (ask-20261005-112844-10ba).
export const ProtectedRoute = () => {
  const location = useLocation()

  const { user, isLoading: isLoadingUser } = useMe()

  if (isLoadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="text-ui-fg-interactive animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <SidebarProvider>
      <Outlet />
    </SidebarProvider>
  )
}
