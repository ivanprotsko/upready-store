import { Heading, Text } from "@medusajs/ui"
import { useNavigate, useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useProductImport } from "../../../hooks/api/product-csv"
import { ImportReportView } from "./import-report-view"
import { ImportUpload } from "./import-upload"

/**
 * «Загрузить CSV» (t14-product-import, step 7). A focus modal rather than a
 * drawer: the dry-run report is a table of a hundred lines and a 440 px drawer
 * is the wrong shape to read one in.
 *
 * ONE SCREEN, TWO URLS. `/products/import` is the upload; `/products/import/:id`
 * is the report, read from the server by id. That split is what makes the report
 * survive a page reload, a closed tab and a link sent to somebody else — the
 * plan lives in a row, not in this component's state.
 */
export const ProductImport = () => {
  const { import_id: importId } = useParams()
  const navigate = useNavigate()

  const { product_import, isPending, isError, error } = useProductImport(
    importId ?? "",
    { enabled: Boolean(importId) }
  )

  if (isError) {
    throw error
  }

  return (
    <RouteFocusModal>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>Загрузить каталог из CSV</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              Сначала проверка и отчёт по строкам, потом — ваше подтверждение
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>

      <RouteFocusModal.Body className="flex flex-col overflow-y-auto px-6 py-6">
        {!importId ? (
          <ImportUpload
            onUploaded={(id) => navigate(`/products/import/${id}`, { replace: true })}
          />
        ) : isPending ? (
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем отчёт…
          </Text>
        ) : product_import ? (
          <ImportReportView productImport={product_import} />
        ) : null}
      </RouteFocusModal.Body>
    </RouteFocusModal>
  )
}
