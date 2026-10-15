import { useMemo } from "react"
import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useDomains } from "../../../hooks/api/domains"
import { TenantPage, useTenantPages } from "../../../hooks/api/pages"
import { useDataTable } from "../../../hooks/use-data-table"
import { useQueryParams } from "../../../hooks/use-query-params"
import { STATUS_COLOR, footerPlace, isSectionKey, orderedPages, statusOf } from "../page-sections"
import { PageRowActions } from "./page-row-actions"

// tenant-panel wave 2, piece 7: the panel's own screen, no Admin counterpart
// (the native Admin has no per-store content pages).
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `pages` and
// `pages-menu`): the list after panel-ds E1 and E10. `Container` with the
// heading and its one button «Добавить страницу», which opens the create modal
// `/pages/create` the way «Добавить товар» opens its own (Ivan 14.10: «пусть
// появляется когда юзер нажимает "добавить страницу"»); the inline row of two
// fields under the table is gone. The table is `_DataTable`: a row opens the
// editor, «В подвале» is the link's place in the footer (1, 2, 3, or «—»), and
// the arrows and the bin moved into the row's «…». No empty state: the five
// ready sections are always there, «Пусто» at worst.

const PAGE_SIZE = 20

const columnHelper = createColumnHelper<TenantPage>()

/** The page's address as the owner reads it, and as a link opens it. */
const pageAddress = (host: string | undefined, key: string) => ({
  label: host ? `${host}/pages/${key}` : `/pages/${key}`,
  href: host ? `https://${host}/pages/${key}` : undefined,
})

const useColumns = (pages: TenantPage[], host: string | undefined) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("title", {
        header: t("contentPages.columns.page"),
        cell: ({ row }) => {
          const page = row.original
          const section = isSectionKey(page.key) ? page.key : null
          return (
            <Text
              size="small"
              leading="compact"
              weight="plus"
              className="truncate"
              title={section ? t(`contentPages.sections.${section}.hint`) : page.key}
            >
              {page.title.trim() ||
                (section ? t(`contentPages.sections.${section}.label`) : page.key)}
            </Text>
          )
        },
      }),
      columnHelper.accessor("key", {
        header: t("contentPages.columns.address"),
        cell: ({ getValue }) => {
          const { label } = pageAddress(host, getValue())
          return (
            <Text size="small" leading="compact" className="text-ui-fg-subtle font-mono truncate" title={label}>
              {label}
            </Text>
          )
        },
      }),
      columnHelper.display({
        id: "status",
        header: t("contentPages.columns.status"),
        cell: ({ row }) => {
          const status = statusOf(row.original)
          return (
            <StatusBadge color={STATUS_COLOR[status]} className="whitespace-nowrap">
              {t(`contentPages.status.${status}`)}
            </StatusBadge>
          )
        },
      }),
      columnHelper.display({
        id: "footer",
        header: t("contentPages.columns.footer"),
        cell: ({ row }) => (
          <Text size="small" leading="compact" className="tabular-nums">
            {footerPlace(pages, row.original.key) ?? "—"}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <PageRowActions
            page={row.original}
            pages={pages}
            href={pageAddress(host, row.original.key).href}
          />
        ),
      }),
    ],
    [t, pages, host]
  )
}

export const PageList = () => {
  const { t } = useTranslation()
  const { offset } = useQueryParams(["offset"])
  const { pages, isPending, isError, error } = useTenantPages()
  const { primary_host: primaryHost } = useDomains()

  const all = useMemo(() => orderedPages(pages ?? []), [pages])
  const start = Math.max(Number(offset) || 0, 0)
  const rows = useMemo(() => all.slice(start, start + PAGE_SIZE), [all, start])
  const columns = useColumns(all, primaryHost)

  const { table } = useDataTable({
    data: rows,
    columns,
    count: all.length,
    pageSize: PAGE_SIZE,
    enablePagination: true,
    getRowId: (row) => row.key,
  })

  if (isError) {
    throw error
  }

  if (isPending || !pages) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <Container className="divide-y p-0" data-testid="pages">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("contentPages.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("contentPages.subtitle")}
            </Text>
          </div>
          <Link to="/pages/create">
            <Button size="small" variant="secondary" data-testid="page-create">
              {t("contentPages.add")}
            </Button>
          </Link>
        </div>
        <_DataTable
          table={table}
          columns={columns}
          count={all.length}
          pageSize={PAGE_SIZE}
          pagination
          navigateTo={(row) => `/pages/${row.original.key}`}
        />
      </Container>
    </SingleColumnPage>
  )
}
