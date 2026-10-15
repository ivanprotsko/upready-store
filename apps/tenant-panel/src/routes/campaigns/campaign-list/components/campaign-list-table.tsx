import { AdminCampaign } from "@medusajs/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { _DataTable } from "../../../../components/table/data-table"
import { useCampaigns } from "../../../../hooks/api/campaigns"
import { useCampaignTableColumns } from "../../../../hooks/table/columns/use-campaign-table-columns"
import { useCampaignTableQuery } from "../../../../hooks/table/query/use-campaign-table-query"
import { useDataTable } from "../../../../hooks/use-data-table"
import { CampaignListTableActions } from "./campaign-list-table-actions"

const PAGE_SIZE = 20

export const CampaignListTable = () => {
  const { t } = useTranslation()
  const { raw, searchParams } = useCampaignTableQuery({ pageSize: PAGE_SIZE })

  const {
    campaigns,
    count,
    isPending: isLoading,
    isError,
    error,
  } = useCampaigns(searchParams, {
    placeholderData: keepPreviousData,
  })

  const columns = useColumns()

  const { table } = useDataTable({
    data: campaigns ?? [],
    columns,
    count,
    enablePagination: true,
    getRowId: (row) => row.id,
    pageSize: PAGE_SIZE,
  })

  if (isError) {
    throw error
  }

  // t-2026-10-14-01 (Ivan 14.10 on this list: «как этим пользоваться?»): one
  // sentence says what a campaign is and how to fill it. It stands once on the
  // screen: under the heading when there are campaigns, in the empty state
  // with «Создать» when there are none (`_DataTable`'s own no-records test).
  const noCampaigns =
    count === 0 && Object.values(raw).filter((v) => Boolean(v)).length === 0

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <div className="min-w-0">
          <Heading level="h1">{t("campaigns.domain")}</Heading>
          {isLoading || noCampaigns ? null : (
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("campaigns.subtitle")}
            </Text>
          )}
        </div>
        <Link to="/campaigns/create" className="shrink-0">
          <Button size="small" variant="secondary">
            {t("actions.create")}
          </Button>
        </Link>
      </div>

      <_DataTable
        table={table}
        columns={columns}
        count={count}
        pageSize={PAGE_SIZE}
        pagination
        search
        navigateTo={(row) => row.id}
        isLoading={isLoading}
        queryObject={raw}
        orderBy={[
          { key: "name", label: t("fields.name") },
          { key: "created_at", label: t("fields.createdAt") },
          { key: "updated_at", label: t("fields.updatedAt") },
        ]}
        noRecords={{
          title: t("campaigns.list.empty.heading"),
          message: t("campaigns.subtitle"),
          action: { to: "/campaigns/create", label: t("actions.create") },
        }}
      />
    </Container>
  )
}

const columnHelper = createColumnHelper<AdminCampaign>()

const useColumns = () => {
  const base = useCampaignTableColumns()

  return useMemo(
    () => [
      ...base,
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => {
          return <CampaignListTableActions campaign={row.original} />
        },
      }),
    ],
    [base]
  )
}
