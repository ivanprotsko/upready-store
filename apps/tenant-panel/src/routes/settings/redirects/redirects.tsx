import { Button, Container, Heading, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { NoRecords, NoResults } from "../../../components/common/empty-table-content"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { DataTableQuery } from "../../../components/table/data-table/data-table-query"
import { useDomains } from "../../../hooks/api/domains"
import { TenantRedirect, useTenantRedirects } from "../../../hooks/api/redirects"
import { useDataTable } from "../../../hooks/use-data-table"
import { useQueryParams } from "../../../hooks/use-query-params"
import { redirectListPage } from "./redirect-list"
import { RedirectFromCell, RedirectRowActions } from "./redirect-row"

// b10-panel-gaps: «Старые адреса» — the shop's own redirect table. The routes
// (`/tenants/redirects*`) shipped with t11-seo-redirects and had no screen, so
// the 47 rules the migration of Oksana's shop imported were invisible to her.
//
// t-2026-10-14-01 (panel redesign, G2, prototype states `redirects*`): the
// list after panel-ds E1, E8 and E10. `Container` with the heading and its one
// button «Добавить правило», the search and the order over the table, the
// table on `_DataTable` with 20 rules a page. The search, the order and the
// page live in the URL and are applied in the browser (`redirect-list.ts`):
// the backend answers every rule at once. A row opens its edit drawer; the
// add form and the edit in a row became the drawers `create` and `:id/edit`.
// Empty: «Правил пока нет» with the one button; a search that found nothing
// says so with the query, keeps the search field and has no button.

const PAGE_SIZE = 20

const columnHelper = createColumnHelper<TenantRedirect>()

const useColumns = (primaryHost: string | undefined) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("from_path", {
        header: t("redirects.columnFrom"),
        cell: ({ row }) => <RedirectFromCell redirect={row.original} primaryHost={primaryHost} />,
      }),
      columnHelper.accessor("to_path", {
        header: t("redirects.columnTo"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="font-mono truncate">
            {getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor("status_code", {
        header: t("redirects.columnKind"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle whitespace-nowrap">
            {t(`redirects.status.${getValue()}`)}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <RedirectRowActions redirect={row.original} />,
      }),
    ],
    [t, primaryHost]
  )
}

export const Redirects = () => {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { q, order, offset } = useQueryParams(["q", "order", "offset"])
  const { redirects, isPending, isError, error } = useTenantRedirects()
  const { primary_host: primaryHost } = useDomains()

  const shopOrigin = primaryHost ? `https://${primaryHost}` : undefined
  const columns = useColumns(shopOrigin)
  const page = useMemo(
    () =>
      redirectListPage(redirects ?? [], {
        q,
        order,
        offset: Number(offset) || 0,
        limit: PAGE_SIZE,
      }),
    [redirects, q, order, offset]
  )

  const { table } = useDataTable({
    data: page.rows,
    columns,
    count: page.count,
    pageSize: PAGE_SIZE,
    enablePagination: true,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  if (isPending || !redirects) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const hasRules = redirects.length > 0

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <Container className="divide-y p-0" data-testid="redirects">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("redirects.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("redirects.subtitle")}
            </Text>
          </div>
          {hasRules ? (
            <Link to="/settings/redirects/create">
              <Button size="small" variant="secondary">
                {t("redirects.addAction")}
              </Button>
            </Link>
          ) : null}
        </div>

        {!hasRules ? (
          <NoRecords
            title={t("redirects.emptyTitle")}
            message={t("redirects.emptyMessage")}
            action={{ to: "/settings/redirects/create", label: t("redirects.addAction") }}
          />
        ) : (
          <>
            <DataTableQuery<TenantRedirect>
              search
              orderBy={[
                { key: "from_path", label: t("redirects.columnFrom") },
                { key: "to_path", label: t("redirects.columnTo") },
              ]}
            />
            {page.count === 0 ? (
              <NoResults
                title={t("redirects.noResultsTitle")}
                message={t("redirects.noResultsMessage", { query: q?.trim() ?? "" })}
              />
            ) : (
              <_DataTable
                table={table}
                columns={columns}
                count={page.count}
                pageSize={PAGE_SIZE}
                pagination
                navigateTo={(row) => `/settings/redirects/${row.original.id}/edit${search}`}
              />
            )}
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
