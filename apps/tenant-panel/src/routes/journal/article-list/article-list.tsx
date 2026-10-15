import { useMemo } from "react"
import { Badge, Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { NoRecords, NoResults } from "../../../components/common/empty-table-content"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { Filter, _DataTable } from "../../../components/table/data-table"
import { DataTableQuery } from "../../../components/table/data-table/data-table-query"
import { useDomains } from "../../../hooks/api/domains"
import { useTenantArticleCategories, useTenantArticles } from "../../../hooks/api/articles"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import { useQueryParams } from "../../../hooks/use-query-params"
import { ARTICLE_STATUSES, STATUS_COLOR, localeLabel, localeTag, shownStatus } from "../article-locales"
import { ArticleGroup, articleListPage, groupArticles } from "./article-groups"
import { ArticleRowActions } from "./article-row-actions"

// t10-blog: the shop's journal. The panel's own screen, no Admin counterpart.
// b18-blog-full gave it the search, a status filter and a rubric filter, and
// moved «Новая статья» to the top as a whole editor screen.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `journal`,
// `journal-empty`, `journal-no-results`): the list after panel-ds E1 and E10.
// `Container` with the heading and its one button «Написать статью», then the
// native toolbar — «Добавить фильтр» with «Статус» and «Рубрика», and the
// search — and `_DataTable` with 20 articles a page, a row opening the editor
// and its «…». The search, the filters and the page live in the URL
// (`article-groups.ts`). No articles at all: «Статей пока нет» with the one
// button. A query that finds nothing: «Ничего не найдено», the toolbar stays.

const PAGE_SIZE = 20

const columnHelper = createColumnHelper<ArticleGroup>()

/** The article's address as the owner reads it, and as a link opens it. */
export const articleAddress = (host: string | undefined, slug: string) => ({
  label: host ? `${host}/journal/${slug}` : `/journal/${slug}`,
  href: host ? `https://${host}/journal/${slug}` : undefined,
})

const useColumns = (host: string | undefined) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  return useMemo(
    () => [
      columnHelper.display({
        id: "article",
        header: t("journal.columns.article"),
        cell: ({ row }) => (
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className="truncate"
            title={articleAddress(host, row.original.slug).label}
          >
            {row.original.primary.title.trim() || row.original.slug}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "status",
        header: t("journal.columns.status"),
        cell: ({ row }) => {
          const status = shownStatus(row.original.primary)
          return (
            <StatusBadge color={STATUS_COLOR[status]} className="whitespace-nowrap">
              {t(`journal.status.${status}`)}
            </StatusBadge>
          )
        },
      }),
      columnHelper.display({
        id: "category",
        header: t("journal.columns.category"),
        cell: ({ row }) => (
          <Text size="small" leading="compact" className="truncate">
            {row.original.primary.category || "—"}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "locales",
        header: t("journal.columns.locales"),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.locales.map((text) => (
              <Badge
                key={text.locale}
                size="2xsmall"
                title={`${localeLabel(text.locale)} · ${t(`journal.status.${shownStatus(text)}`)}`}
              >
                {localeTag(text.locale)}
              </Badge>
            ))}
          </div>
        ),
      }),
      columnHelper.display({
        id: "date",
        header: t("journal.columns.date"),
        cell: ({ row }) => {
          const date = row.original.primary.published_at
          return (
            <Text size="small" leading="compact" className="text-ui-fg-subtle whitespace-nowrap">
              {date ? getFullDate({ date }) : "—"}
            </Text>
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <ArticleRowActions group={row.original} href={articleAddress(host, row.original.slug).href} />
        ),
      }),
    ],
    [t, getFullDate, host]
  )
}

const useFilters = (): Filter[] => {
  const { t } = useTranslation()
  const { categories } = useTenantArticleCategories()

  return useMemo(() => {
    const filters: Filter[] = [
      {
        key: "status",
        label: t("journal.filters.status"),
        type: "select",
        multiple: true,
        options: ARTICLE_STATUSES.map((status) => ({ label: t(`journal.status.${status}`), value: status })),
      },
    ]
    if (categories && categories.length > 0) {
      filters.push({
        key: "category",
        label: t("journal.filters.category"),
        type: "select",
        multiple: true,
        options: categories.map((option) => ({
          label: t("journal.editor.categoryOption", { category: option.category, number: option.count }),
          value: option.category,
        })),
      })
    }
    return filters
  }, [t, categories])
}

export const ArticleList = () => {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { q, status, category, offset } = useQueryParams(["q", "status", "category", "offset"])
  const { articles, isPending, isError, error } = useTenantArticles()
  const { primary_host: primaryHost } = useDomains()

  const columns = useColumns(primaryHost)
  const filters = useFilters()
  const groups = useMemo(() => groupArticles(articles ?? []), [articles])
  const page = useMemo(
    () =>
      articleListPage(groups, { q, status, category, offset: Number(offset) || 0, limit: PAGE_SIZE }),
    [groups, q, status, category, offset]
  )

  const { table } = useDataTable({
    data: page.rows,
    columns,
    count: page.count,
    pageSize: PAGE_SIZE,
    enablePagination: true,
    getRowId: (row) => row.slug,
  })

  if (isError) {
    throw error
  }

  if (isPending || !articles) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const hasArticles = groups.length > 0

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <Container className="divide-y p-0" data-testid="journal">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("journal.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("journal.subtitle")}
            </Text>
          </div>
          {hasArticles ? (
            <Link to="/journal/new">
              <Button size="small" variant="secondary" data-testid="article-new">
                {t("journal.add")}
              </Button>
            </Link>
          ) : null}
        </div>

        {!hasArticles ? (
          <NoRecords
            title={t("journal.empty.title")}
            message={t("journal.empty.message")}
            action={{ to: "/journal/new", label: t("journal.add") }}
          />
        ) : (
          <>
            <DataTableQuery<ArticleGroup> search filters={filters} />
            {page.count === 0 ? (
              <NoResults title={t("journal.noResults.title")} message={t("journal.noResults.message")} />
            ) : (
              <_DataTable
                table={table}
                columns={columns}
                count={page.count}
                pageSize={PAGE_SIZE}
                pagination
                navigateTo={(row) => `/journal/${row.original.slug}${search}`}
              />
            )}
          </>
        )}
      </Container>
    </SingleColumnPage>
  )
}
