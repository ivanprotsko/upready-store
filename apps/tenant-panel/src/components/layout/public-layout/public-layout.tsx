import { Outlet } from "react-router-dom"

import { DocumentFavicon } from "../../../hooks/use-document-favicon"
import { DocumentTitle } from "../../../hooks/use-document-title"

export const PublicLayout = () => {
  return (
    <>
      <DocumentTitle />
      <DocumentFavicon />
      <Outlet />
    </>
  )
}
