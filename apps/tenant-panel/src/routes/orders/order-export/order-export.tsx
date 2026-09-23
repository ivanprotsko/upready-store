import { Button, Heading, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { useExportOrders } from "../../../hooks/api"
import { useOrderTableQuery } from "../../../hooks/table/query"
import { saveCsv } from "../../../lib/csv-download"
import { ExportFilters } from "./components/export-filters"

export const OrderExport = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("orders.export.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("orders.export.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <OrderExportContent />
    </RouteDrawer>
  )
}

const OrderExportContent = () => {
  const { t } = useTranslation()
  const { searchParams } = useOrderTableQuery({})

  const { mutateAsync } = useExportOrders(searchParams)
  const { handleSuccess } = useRouteModal()

  const handleExportRequest = async () => {
    await mutateAsync(searchParams, {
      // tenant-panel: the Admin's export starts a background workflow and the
      // file arrives by notification, so its own handler only shows the
      // "started" toast. `POST /tenants/orders/export` builds the CSV
      // synchronously and answers with the file itself, and the panel has no
      // notification feed, so the file is saved here instead.
      onSuccess: (file) => {
        saveCsv(file)

        toast.info(t("orders.export.success.title"), {
          description: t("orders.export.success.description"),
        })

        handleSuccess()
      },
      onError: (err) => {
        toast.error(err.message)
      },
    })
  }

  return (
    <>
      <RouteDrawer.Body>
        <ExportFilters />
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </RouteDrawer.Close>
          <Button onClick={handleExportRequest} size="small">
            {t("actions.export")}
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
