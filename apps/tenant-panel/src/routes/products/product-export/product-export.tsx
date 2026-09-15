import { Heading } from "@medusajs/ui"

import { RouteDrawer } from "../../../components/modals"
import { ExportCsvBody } from "./export-csv-body"

/**
 * «Выгрузить CSV» on the products screen (t14-product-import). The Admin's own
 * export drawer offers column and filter pickers and then answers «we will
 * notify you»; this one hands over the file, because the file IS the import's
 * format and the owner's next step is opening it in Excel.
 */
export const ProductExport = () => {
  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>Выгрузить каталог в CSV</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          Скачать таблицу со всеми товарами магазина
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <ExportCsvBody />
    </RouteDrawer>
  )
}
