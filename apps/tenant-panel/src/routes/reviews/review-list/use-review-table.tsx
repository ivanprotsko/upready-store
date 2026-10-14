import { EllipsisHorizontal } from "@medusajs/icons"
import { IconButton, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import type { Filter } from "../../../components/table/data-table"
import { useProducts } from "../../../hooks/api/products"
import {
  REVIEW_SOURCES,
  REVIEW_STATUSES,
  type TenantReview,
} from "../../../hooks/api/reviews"
import { useDate } from "../../../hooks/use-date"
import { useQueryParams } from "../../../hooks/use-query-params"
import { ReviewStars } from "../components/review-stars"
import {
  REVIEW_STATUS_COLOR,
  reviewOrigin,
  reviewStatusHint,
  reviewStatusLabel,
} from "../labels"
import { useReviewActions } from "../use-review-actions"

// t-2026-10-14-01 (panel redesign, G5): the columns, filters and address of
// /reviews, read the way Wildberries → «Отзывы» reads its table (Ivan
// 14.10.2026 ~23:45): Оценка · Отзыв · Товар · Покупатель · Дата · Ответ ·
// Статус · «…», one line per cell, every action in the row's «…».

export const PAGE_SIZE = 20

/** The filter keys the address holds, the order «Добавить фильтр» lists them. */
export const FILTER_KEYS = ["status", "rating", "answered", "product_id", "source"] as const

const list = (value: string | undefined) => (value ? value.split(",") : undefined)

/**
 * The list's query, read from the address: `?status=pending,hidden&rating=1,2`
 * is the `_DataTable` convention, and the API takes one parameter per item.
 */
export const useReviewListQuery = () => {
  const raw = useQueryParams(["offset", "order", "q", ...FILTER_KEYS])
  return {
    raw,
    query: {
      status: list(raw.status) as TenantReview["status"][] | undefined,
      rating: list(raw.rating),
      answered: list(raw.answered),
      product_id: list(raw.product_id),
      source: list(raw.source),
      q: raw.q,
      order: raw.order,
      limit: PAGE_SIZE,
      offset: raw.offset ? Number(raw.offset) : 0,
    },
  }
}

const RowActions = ({ review, search }: { review: TenantReview; search: string }) => {
  const { t } = useTranslation()
  const { groups } = useReviewActions(review)

  return (
    <ActionMenu
      groups={groups({
        openTo: `/reviews/${review.id}${search}`,
        replyTo: `/reviews/${review.id}/reply${search}`,
      })}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

/** «14 окт. 2026» (`getFullDate`, rule 14), or «дата неизвестна» for an import that had none. */
const WrittenAtCell = ({ date }: { date: string | null }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  return (
    <Text size="small" leading="compact" className="whitespace-nowrap">
      {date ? getFullDate({ date }) : t("reviews.dateUnknown")}
    </Text>
  )
}

const columnHelper = createColumnHelper<TenantReview>()

export const useReviewColumns = (search: string) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("rating", {
        header: t("reviews.columns.rating"),
        cell: ({ getValue }) => <ReviewStars rating={getValue()} />,
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("body", {
        header: t("reviews.columns.review"),
        cell: ({ row }) => {
          const text = [row.original.title, row.original.body].filter(Boolean).join(" — ")
          return (
            <div className="flex h-full w-full max-w-[360px] items-center overflow-hidden">
              <Text size="small" leading="compact" className="truncate">
                {text}
              </Text>
            </div>
          )
        },
        meta: { phoneWide: true },
      }),
      columnHelper.display({
        id: "product",
        header: t("reviews.columns.product"),
        cell: ({ row }) => (
          <div className="flex h-full w-full max-w-[220px] items-center overflow-hidden">
            <Text size="small" leading="compact" className="truncate">
              {row.original.product?.title ?? t("reviews.productGone")}
            </Text>
          </div>
        ),
      }),
      columnHelper.accessor("author_name", {
        header: t("reviews.columns.author"),
        cell: ({ row }) => (
          // Where the review came from stays reachable on hover, never as a
          // second line under the name (table-cells-one-line).
          <Text
            size="small"
            leading="compact"
            className="truncate"
            title={reviewOrigin(t, row.original.source, row.original.language)}
          >
            {row.original.author_name}
          </Text>
        ),
      }),
      columnHelper.accessor("written_at", {
        header: t("reviews.columns.date"),
        cell: ({ getValue }) => <WrittenAtCell date={getValue()} />,
      }),
      columnHelper.accessor("reply", {
        header: t("reviews.columns.reply"),
        cell: ({ getValue }) =>
          getValue() ? (
            <Text size="small" leading="compact">
              {t("reviews.replyState.yes")}
            </Text>
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-muted">
              {t("reviews.replyState.no")}
            </Text>
          ),
      }),
      columnHelper.accessor("status", {
        header: t("reviews.columns.status"),
        cell: ({ getValue }) => (
          <StatusBadge
            color={REVIEW_STATUS_COLOR[getValue()]}
            title={reviewStatusHint(t, getValue())}
            className="whitespace-nowrap"
          >
            {reviewStatusLabel(t, getValue())}
          </StatusBadge>
        ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <RowActions review={row.original} search={search} />,
      }),
    ],
    [t, search]
  )
}

/** Status, rating and answer first (the lead's G5 decision), product and source after. */
export const useReviewFilters = (): Filter[] => {
  const { t } = useTranslation()
  const { products } = useProducts({ limit: 100, fields: "id,title" })

  return useMemo(
    () => [
      {
        key: "status",
        label: t("reviews.columns.status"),
        type: "select",
        multiple: true,
        options: REVIEW_STATUSES.map((status) => ({
          label: reviewStatusLabel(t, status),
          value: status,
        })),
      },
      {
        key: "rating",
        label: t("reviews.columns.rating"),
        type: "select",
        multiple: true,
        options: [5, 4, 3, 2, 1].map((n) => ({
          label: t("reviews.stars", { count: n }),
          value: String(n),
        })),
      },
      {
        key: "answered",
        label: t("reviews.columns.reply"),
        type: "select",
        options: [
          { label: t("reviews.filters.unanswered"), value: "no" },
          { label: t("reviews.filters.answered"), value: "yes" },
        ],
      },
      {
        key: "product_id",
        label: t("reviews.columns.product"),
        type: "select",
        multiple: true,
        searchable: true,
        options: (products ?? []).map((product) => ({
          label: product.title,
          value: product.id,
        })),
      },
      {
        key: "source",
        label: t("reviews.filters.source"),
        type: "select",
        multiple: true,
        options: REVIEW_SOURCES.map((source) => ({
          label: t(`reviews.filters.sources.${source}`),
          value: source,
        })),
      },
    ],
    [t, products]
  )
}
