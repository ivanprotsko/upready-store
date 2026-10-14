import { Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useTenantReviews } from "../../../hooks/api/reviews"
import { useDataTable } from "../../../hooks/use-data-table"
import {
  PAGE_SIZE,
  useReviewColumns,
  useReviewFilters,
  useReviewListQuery,
} from "./use-review-table"

// t09-reviews: the panel's own /reviews screen, no Admin counterpart. The list
// is the moderation queue: a review a customer leaves on the storefront arrives
// «На проверке» and is invisible there until it is published here.
//
// t-2026-10-14-01 (panel redesign, G5, prototype states `reviews`,
// `reviews-menu`, `reviews-noresults`, `reviews-empty`): the list reads like
// Wildberries → «Отзывы» (Ivan 14.10.2026 ~23:45). `_DataTable` with
// «Добавить фильтр» (status, rating, answer, product, source), search and sort,
// all in the address; a row opens the review in a drawer at /reviews/:id; the
// buttons, the bin and the reply form that stood in each row moved into its
// «…» and into the two drawers. The header counts the reviews waiting.

export const ReviewList = () => {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { raw, query } = useReviewListQuery()

  const { reviews, count, isLoading, isError, error } = useTenantReviews(query, {
    placeholderData: keepPreviousData,
  })
  // The header's «N ждут проверки»: the same count the queue filter gives.
  const { count: pending } = useTenantReviews({ status: "pending", limit: 1 })

  const columns = useReviewColumns(search)
  const filters = useReviewFilters()
  const { table } = useDataTable({
    data: reviews ?? [],
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
    <SingleColumnPage widgets={{ before: [], after: [] }} data={reviews} hasOutlet>
      <Container className="divide-y p-0" data-testid="reviews">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("reviews.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("reviews.subtitle")}
            </Text>
          </div>
          {pending ? (
            <StatusBadge color="orange" className="shrink-0 whitespace-nowrap">
              {t("reviews.pending", { count: pending })}
            </StatusBadge>
          ) : null}
        </div>
        <_DataTable
          table={table}
          columns={columns}
          count={count ?? 0}
          pageSize={PAGE_SIZE}
          filters={filters}
          search
          pagination
          isLoading={isLoading}
          queryObject={raw}
          navigateTo={(row) => `/reviews/${row.original.id}${search}`}
          orderBy={[
            { key: "written_at", label: t("reviews.columns.date") },
            { key: "rating", label: t("reviews.columns.rating") },
          ]}
          noRecords={{
            title: t("reviews.empty.title"),
            message: t("reviews.empty.message"),
          }}
        />
      </Container>
    </SingleColumnPage>
  )
}
