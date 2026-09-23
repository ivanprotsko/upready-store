import { ArrowDownTray } from "@medusajs/icons"
import { Button, Container, Heading, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { _DataTable } from "../../../components/table/data-table/data-table"
import { useCustomers, useExportCustomers } from "../../../hooks/api/customers"
import { useCustomerTableColumns } from "../../../hooks/table/columns"
import { useCustomerTableQuery } from "../../../hooks/table/query"
import { useDataTable } from "../../../hooks/use-data-table"
import { saveCsv } from "../../../lib/csv-download"

// tenant-panel: t13-customers-screen. Own screen, no Admin counterpart at
// this path — the Admin's own `/customers` is a store-wide list; this is
// scoped to the tenant, with two columns (`orders_count`, `total_spent`)
// the Admin table does not have. Built the same shape as
// `routes/orders/order-list/components/order-list-table/order-list-table.tsx`
// (`_DataTable` + `useDataTable`), so pagination, search and sorting behave
// exactly like the Orders screen the owner already knows.

const PAGE_SIZE = 20

export const CustomerList = () => {
  const { t } = useTranslation()

  const { searchParams, raw } = useCustomerTableQuery({ pageSize: PAGE_SIZE })

  const { customers, count, isError, error, isLoading } = useCustomers(
    searchParams,
    { placeholderData: keepPreviousData }
  )

  const columns = useCustomerTableColumns()

  const { table } = useDataTable({
    data: customers ?? [],
    columns,
    enablePagination: true,
    count,
    pageSize: PAGE_SIZE,
  })

  const { mutateAsync: exportCustomers, isPending: isExporting } =
    useExportCustomers({ q: searchParams.q })

  const handleExport = async () => {
    await exportCustomers(undefined, {
      onSuccess: (file) => {
        saveCsv(file)

        const rowCount = file.count
        toast.success(t("customers.export.success.title"), {
          description: t("customers.export.success.description", {
            count: rowCount,
          }),
        })
      },
      onError: (err) => {
        toast.error(err.message)
      },
    })
  }

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>{t("customers.domain")}</Heading>
        <Button
          size="small"
          variant="secondary"
          isLoading={isExporting}
          onClick={handleExport}
        >
          <ArrowDownTray />
          {t("actions.export")}
        </Button>
      </div>
      <_DataTable
        columns={columns}
        table={table}
        pagination
        navigateTo={(row) => `/customers/${row.original.id}`}
        count={count}
        search
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        orderBy={[
          { key: "created_at", label: t("fields.createdAt") },
          { key: "orders_count", label: t("fields.orders") },
        ]}
        queryObject={raw}
        noRecords={{
          message: t("customers.list.noRecordsMessage"),
        }}
      />
    </Container>
  )
}
