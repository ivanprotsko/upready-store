import { Filter } from ".."
import { DataTableFilter } from "../data-table-filter"
import { DataTableOrderBy, DataTableOrderByKey } from "../data-table-order-by"
import { DataTableSearch } from "../data-table-search"

export interface DataTableQueryProps<TData> {
  search?: boolean | "autofocus"
  orderBy?: DataTableOrderByKey<TData>[]
  filters?: Filter[]
  prefix?: string
}

export const DataTableQuery = <TData,>({
  search,
  orderBy,
  filters,
  prefix,
}: DataTableQueryProps<TData>) => {
  return (
    (search || orderBy || filters || prefix) && (
      <div className="flex items-start justify-between gap-x-4 px-6 py-4 max-md:flex-col-reverse max-md:gap-y-2">
        <div className="w-full max-w-[60%] max-md:max-w-full">
          {filters && filters.length > 0 && (
            <DataTableFilter filters={filters} prefix={prefix} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-x-2 max-md:w-full max-md:shrink max-md:[&>*:first-child]:min-w-0 max-md:[&>*:first-child]:flex-1">
          {search && (
            <DataTableSearch
              prefix={prefix}
              autofocus={search === "autofocus"}
            />
          )}
          {orderBy && <DataTableOrderBy keys={orderBy} prefix={prefix} />}
        </div>
      </div>
    )
  )
}
