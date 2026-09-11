import { Heading, Text } from "@medusajs/ui"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useTenantPage } from "../../../hooks/api/pages"
import { sectionOf } from "../page-sections"
import { EditPageForm } from "./components/edit-page-form/edit-page-form"

// tenant-panel wave 2, piece 7: the panel's own edit screen, no Admin
// counterpart. A focus modal rather than the drawer `profile-edit` uses: the
// body is a markdown document, and a 440 px drawer is the wrong shape to write
// a privacy policy in (`RouteFocusModal`'s own doc comment: "forms that
// require a lot of space").
//
// An unknown key is not handled here: `GET /tenants/pages/:key` answers 404 for
// it, `useTenantPage` surfaces that as an error, and the throw below lands on
// the router's ErrorBoundary — the same path a foreign product id takes in the
// copied product-detail screen.

export const PageEdit = () => {
  const { key = "" } = useParams()
  const section = sectionOf(key)
  const { page, isPending, isError, error } = useTenantPage(key)

  if (isError) {
    throw error
  }

  return (
    <RouteFocusModal>
      <RouteFocusModal.Header>
        {/* `FocusModal.Header` is `flex items-center justify-between` with its
            own close/esc group first, so children land hard against the right
            edge (measured on the Admin's own header). `flex-1` gives the title
            the rest of the row and puts it where a title belongs. */}
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{section?.label ?? key}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              {section?.hint ?? "One of your storefront's content pages."}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      {!isPending && page && <EditPageForm pageKey={key} page={page} />}
    </RouteFocusModal>
  )
}
