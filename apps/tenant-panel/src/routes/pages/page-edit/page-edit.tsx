import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useTenantPage } from "../../../hooks/api/pages"
import { isSectionKey } from "../page-sections"
import { EditPageForm } from "./components/edit-page-form/edit-page-form"

// tenant-panel wave 2, piece 7: the panel's own edit screen, no Admin
// counterpart. A focus modal rather than a drawer: the body is a markdown
// document, and a 440 px drawer is the wrong shape to write a privacy policy
// in (panel-ds E4, the editor's exception).
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `pages-edit` and
// `pages-edit-publish`): the form's header carries the tabs «Текст» and
// «Публикация», the page's name and its status (`edit-page-form.tsx`).
//
// An unknown key is not handled here: `GET /tenants/pages/:key` answers 404 for
// it, `useTenantPage` surfaces that as an error, and the throw below lands on
// the router's ErrorBoundary — the same path a foreign product id takes in the
// copied product-detail screen.

export const PageEdit = () => {
  const { t } = useTranslation()
  const { key = "" } = useParams()
  const { page, isPending, isError, error } = useTenantPage(key)

  if (isError) {
    throw error
  }

  const name =
    page?.title.trim() || (isSectionKey(key) ? t(`contentPages.sections.${key}.label`) : key)

  return (
    <RouteFocusModal>
      {!isPending && page ? (
        <EditPageForm pageKey={key} page={page} name={name} />
      ) : (
        <RouteFocusModal.Header>
          <RouteFocusModal.Title asChild>
            <span className="sr-only">{name}</span>
          </RouteFocusModal.Title>
        </RouteFocusModal.Header>
      )}
    </RouteFocusModal>
  )
}
