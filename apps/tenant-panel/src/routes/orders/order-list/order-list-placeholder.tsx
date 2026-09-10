import { Outlet } from "react-router-dom"
import { NotBuilt } from "../../not-built/not-built"

// tenant-panel: placeholder, replaced by piece 4. Renders `NotBuilt` plus an
// `Outlet` so navigating to the nested `/orders/export` route (itself a
// `not-built` placeholder in app.tsx) still mounts a screen.
export const OrderListPlaceholder = () => {
  return (
    <>
      <NotBuilt />
      <Outlet />
    </>
  )
}
