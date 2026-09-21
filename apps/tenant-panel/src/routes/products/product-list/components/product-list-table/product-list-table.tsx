import { Button, Container, Heading, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, Outlet, useLoaderData, useLocation } from "react-router-dom"

import { HttpTypes } from "@medusajs/types"
import { _DataTable } from "../../../../../components/table/data-table"
import { useProductAttributeCoverage } from "../../../../../hooks/api/product-attributes"
import { useProducts } from "../../../../../hooks/api/products"
import { ProductActions } from "./product-list-table-actions"
import { useProductTableColumns } from "../../../../../hooks/table/columns/use-product-table-columns"
import { useProductTableFilters } from "../../../../../hooks/table/filters/use-product-table-filters"
import { useProductTableQuery } from "../../../../../hooks/table/query/use-product-table-query"
import { useDataTable } from "../../../../../hooks/use-data-table"
import { productsLoader } from "../../loader"

const PAGE_SIZE = 20

export const ProductListTable = () => {
  const { t } = useTranslation()
  const location = useLocation()

  const initialData = useLoaderData() as Awaited<
    ReturnType<ReturnType<typeof productsLoader>>
  >

  const { searchParams, raw } = useProductTableQuery({ pageSize: PAGE_SIZE })
  const { products, count, isLoading, isError, error } = useProducts(
    {
      ...searchParams,
      is_giftcard: false,
    },
    {
      initialData,
      placeholderData: keepPreviousData,
    }
  )

  const filters = useProductTableFilters()
  const columns = useColumns()

  // b04-product-attributes: characteristics are filled product by product, so
  // the one thing the list has to say is how many products are still empty.
  // The count is the whole catalog, not the page: the owner works through it
  // over several sessions and a per-page number would never reach the end.
  const { products_total: attributeProductsTotal, products_filled: attributeProductsFilled } =
    useProductAttributeCoverage()

  const { table } = useDataTable({
    data: (products ?? []) as HttpTypes.AdminProduct[],
    columns,
    count,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      {/* o21-owner-panel-ux (P1, P6): «Добавить товар» is the primary action and
          comes first; on a phone the header wraps instead of pushing it off the
          screen. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <Heading level="h1">{t("products.domain")}</Heading>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          <Button size="small" variant="primary" className="max-md:min-h-11 max-md:w-full" asChild>
            <Link to="create" data-testid="products-add">
              {t("products.owner.add")}
            </Link>
          </Button>
          <Button size="small" variant="secondary" className="max-md:min-h-11 max-md:flex-1" asChild>
            <Link to={`import${location.search}`}>{t("products.owner.importAction")}</Link>
          </Button>
          <Button size="small" variant="secondary" className="max-md:min-h-11 max-md:flex-1" asChild>
            <Link to={`export${location.search}`}>{t("products.owner.exportAction")}</Link>
          </Button>
        </div>
        {attributeProductsTotal ? (
          <Text size="small" className="text-ui-fg-subtle basis-full">
            <Link to="/product-attributes" className="hover:text-ui-fg-base transition-fg">
              {t("products.owner.attributesFilled", {
                filled: attributeProductsFilled ?? 0,
                total: attributeProductsTotal,
              })}
            </Link>
          </Text>
        ) : null}
      </div>
      <_DataTable
        table={table}
        columns={columns}
        count={count}
        pageSize={PAGE_SIZE}
        filters={filters}
        search
        pagination
        isLoading={isLoading}
        queryObject={raw}
        navigateTo={(row) => `${row.original.id}`}
        orderBy={[
          { key: "title", label: t("fields.title") },
          { key: "created_at", label: t("fields.createdAt") },
          { key: "updated_at", label: t("fields.updatedAt") },
        ]}
        noRecords={{
          message: t("products.list.noRecordsMessage"),
        }}
      />
      <Outlet />
    </Container>
  )
}

const columnHelper = createColumnHelper<HttpTypes.AdminProduct>()

const useColumns = () => {
  const base = useProductTableColumns()

  const columns = useMemo(
    () => [
      // One shop has one sales channel and the owner keeps no collections: the
      // two columns were the same on every row (o21-owner-panel-ux, P3).
      ...base.filter((c) => {
        const key = (c as { accessorKey?: string }).accessorKey
        return key !== "sales_channels" && key !== "collection"
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => {
          return <ProductActions product={row.original} />
        },
      }),
    ],
    [base]
  )

  return columns
}
