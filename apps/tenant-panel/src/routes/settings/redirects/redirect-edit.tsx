import { FetchError } from "@medusajs/js-sdk"
import { useParams } from "react-router-dom"

import { useTenantRedirects } from "../../../hooks/api/redirects"
import { RedirectDrawer } from "./redirect-drawer"

// t-2026-10-14-01 (panel redesign, G2, prototype state `redirects-edit`):
// «Изменить» of a rule, and a click on its row, open this drawer on
// `/settings/redirects/:id/edit`, over the list. The backend has no
// `GET /tenants/redirects/:id`; the rule is read from the list the page holds.

export const RedirectEdit = () => {
  const { id } = useParams()
  const { redirects, isPending, isError, error } = useTenantRedirects()
  const redirect = redirects?.find((row) => row.id === id)

  if (isError) {
    throw error
  }

  // A rule deleted a moment ago, or an address typed by hand: «не найдено».
  if (!isPending && !redirect) {
    throw new FetchError("Redirect rule not found", "Not Found", 404)
  }

  return (
    <RedirectDrawer
      key={redirect?.id}
      mode="edit"
      redirect={redirect}
      isPending={isPending || !redirect}
    />
  )
}

export { RedirectEdit as Component }
