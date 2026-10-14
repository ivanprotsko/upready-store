import { Navigate, useParams } from "react-router-dom"

import { ApishipConnectionDrawer } from "./connection-drawer"
import { ApishipMethodsDrawer } from "./methods-drawer"
import { ApishipMarkupDrawer, ApishipParcelDrawer } from "./numbers-drawers"
import { ApishipSenderDrawer } from "./sender-drawer"

// t-2026-10-14-58, part B: the one nested route `edit/:section` of the ApiShip
// page draws the drawer of its section. One route instead of five keeps
// `app.tsx` from growing; an unknown section goes back to the read page.

export const ApishipEdit = () => {
  const { section } = useParams()

  switch (section) {
    case "connection":
      return <ApishipConnectionDrawer />
    case "sender":
      return <ApishipSenderDrawer />
    case "parcel":
      return <ApishipParcelDrawer />
    case "methods":
      return <ApishipMethodsDrawer />
    case "markup":
      return <ApishipMarkupDrawer />
    default:
      return <Navigate to=".." relative="path" replace />
  }
}

export { ApishipEdit as Component }
