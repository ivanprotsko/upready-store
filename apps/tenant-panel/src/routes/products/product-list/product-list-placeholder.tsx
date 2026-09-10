import { QueryClient } from "@tanstack/react-query"
import { Outlet } from "react-router-dom"
import { NotBuilt } from "../../not-built/not-built"

// tenant-panel: placeholder, replaced by piece 3/4. Renders `NotBuilt` plus
// an `Outlet` (the Admin's real `ProductList` gets the same outlet for free
// through `LayoutComposer`'s default `hasOutlet={true}`, used to render the
// nested "create" route as a drawer) so navigating to /products/create still
// mounts a screen instead of nothing.
export const ProductListPlaceholder = () => {
  return (
    <>
      <NotBuilt />
      <Outlet />
    </>
  )
}

/**
 * Matches the shape of the Admin's `productsLoader` (a factory taking the
 * query client, returning the actual route loader) without fetching
 * anything.
 */
export const productLoader = (_client: QueryClient) => {
  return async () => null
}
