import { Container, Heading, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useAgentChangesets } from "../../../hooks/api/agent-changesets"
import { useDataTable } from "../../../hooks/use-data-table"
import {
  PAGE_SIZE,
  SiteLinksCell,
  useChangesetColumns,
  useChangesetFilters,
  useChangesetListQuery,
} from "./use-changeset-table"

// t-2026-10-27-04: «Изменения агента». What the owner's agent changed on the
// site, newest first: when, who, what, the status and where to look at it.
// A row opens its card at /agent-changes/:id with every op and its diff;
// publishing and rolling back are in the row's «…» and in the card.

export const ChangesetList = () => {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { raw, query } = useChangesetListQuery()

  const { agent_changesets, count, sites, isLoading, isError, error } = useAgentChangesets(query, {
    placeholderData: keepPreviousData,
  })

  const columns = useChangesetColumns(search, sites)
  const filters = useChangesetFilters()
  const { table } = useDataTable({
    data: agent_changesets ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  // After every hook: the route's ErrorBoundary takes the failure.
  if (isError) {
    throw error
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={agent_changesets} hasOutlet>
      <Container className="divide-y p-0" data-testid="agent-changes">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("agentChanges.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("agentChanges.subtitle")}
            </Text>
          </div>
          <SiteLinksCell sites={sites} />
        </div>
        <_DataTable
          table={table}
          columns={columns}
          count={count ?? 0}
          pageSize={PAGE_SIZE}
          filters={filters}
          pagination
          isLoading={isLoading}
          queryObject={raw}
          navigateTo={(row) => `/agent-changes/${row.original.id}${search}`}
          noRecords={{
            title: t("agentChanges.empty.title"),
            message: t("agentChanges.empty.message"),
          }}
        />
      </Container>
    </SingleColumnPage>
  )
}
