import { Badge } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  DateCell,
  DateHeader,
} from "../../../components/table/table-cells/common/date-cell"
import { MoneyAmountCell } from "../../../components/table/table-cells/common/money-amount-cell"
import { TextCell } from "../../../components/table/table-cells/common/text-cell"
import { TenantCustomerRow } from "../../api/customers"

const columnHelper = createColumnHelper<TenantCustomerRow>()

/**
 * Own hook, no Admin counterpart: the Admin's customer table has no
 * `orders_count`/`total_spent` columns, because a store-wide customer list
 * has no single tenant to aggregate against.
 */
export const useCustomerTableColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "name",
        header: () => t("fields.name"),
        cell: ({ row }) => {
          const { first_name, last_name } = row.original
          const name = [first_name, last_name].filter(Boolean).join(" ")

          return <TextCell text={name || undefined} />
        },
      }),
      columnHelper.accessor("email", {
        header: () => t("fields.email"),
        cell: ({ getValue }) => <TextCell text={getValue() ?? undefined} />,
      }),
      columnHelper.accessor("phone", {
        header: () => t("fields.phone"),
        cell: ({ getValue }) => <TextCell text={getValue() ?? undefined} />,
      }),
      columnHelper.accessor("has_account", {
        header: () => t("customers.fields.registered"),
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge size="2xsmall" color="green">
              {t("customers.registered")}
            </Badge>
          ) : (
            <Badge size="2xsmall" color="grey">
              {t("customers.guest")}
            </Badge>
          ),
      }),
      columnHelper.accessor("orders_count", {
        header: () => t("fields.orders"),
        cell: ({ getValue }) => <TextCell text={getValue()} align="right" />,
      }),
      columnHelper.accessor("total_spent", {
        header: () => t("customers.fields.totalSpent"),
        cell: ({ row }) => (
          <MoneyAmountCell
            currencyCode={row.original.currency_code ?? "usd"}
            amount={row.original.total_spent}
            align="right"
          />
        ),
      }),
      columnHelper.accessor("created_at", {
        header: () => <DateHeader />,
        cell: ({ getValue }) => <DateCell date={new Date(getValue())} />,
      }),
    ],
    [t]
  )
}
