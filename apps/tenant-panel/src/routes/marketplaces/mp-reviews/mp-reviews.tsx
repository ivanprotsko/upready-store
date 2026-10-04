import { ChatBubbleLeftRight, PencilSquare, StarSolid } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import type { DeskItem } from "../../../hooks/api/marketplace-desk"
import { MARKETPLACE_LABEL, useMpReviews, type MarketplaceId } from "../../../hooks/api/marketplace-section"
import { DateTimeCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { MpReviewDrawer } from "./components/mp-review-drawer"

/**
 * «Wildberries → Отзывы» (mp-section-design): the buyers' reviews and
 * questions from the marketplace in the shop's own «Отзывы» table: a row per
 * review, rating as stars, answer state as a coloured dot, the text truncated
 * to one line, a row opens the review with its draft reply.
 *
 * No «отправить» anywhere, as w18 decided (Ivan, 2026-09-16 02:46): a reply is
 * a write to the marketplace, and the keys are read-only. The draft is kept
 * here and the drawer says so in one sentence.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["kind", "rating", "answered", "created_at"] as const

export const MpReviews = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { params, raw, dates } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)

  const { items, count, counts, generator, sending, isLoading, isError, error } = useMpReviews(
    marketplace,
    { ...params, created_at: dates.created_at } as Parameters<typeof useMpReviews>[1],
    { placeholderData: keepPreviousData }
  )

  const [open, setOpen] = useState<DeskItem | null>(null)
  const columns = useColumns(setOpen)
  const filters = useFilters()
  const { table } = useDataTable({
    data: items ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]

  return (
    <MpPage
      title={t("mp.reviews.title")}
      subtitle={
        counts
          ? t("mp.reviews.subtitle", {
              marketplace: label,
              reviews: counts.reviews.total,
              reviewsOpen: counts.reviews.unanswered,
              questions: counts.questions.total,
              questionsOpen: counts.questions.unanswered,
            })
          : null
      }
    >
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
        orderBy={[
          { key: "created_at", label: t("fields.date") },
          { key: "rating", label: t("mp.fields.rating") },
        ]}
        noRecords={{
          title: t("mp.reviews.empty.title"),
          message: t("mp.reviews.empty.message", { marketplace: label }),
        }}
      />
      {open ? (
        <MpReviewDrawer
          item={open}
          generatorAvailable={generator?.available ?? false}
          sendingReason={sending?.reason ?? ""}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </MpPage>
  )
}

const Stars = ({ rating }: { rating: number | null }) => {
  if (rating === null) {
    return <PlaceholderCell />
  }
  return (
    <div className="flex h-full items-center gap-x-0.5" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarSolid
          key={n}
          className={clx("h-3.5 w-3.5", n <= rating ? "text-ui-tag-orange-icon" : "text-ui-fg-disabled")}
        />
      ))}
    </div>
  )
}

const columnHelper = createColumnHelper<DeskItem>()

const useColumns = (onOpen: (item: DeskItem) => void) => {
  const { t } = useTranslation()
  return useMemo(
    () => [
      columnHelper.accessor("rating", {
        header: () => <span>{t("mp.fields.rating")}</span>,
        cell: ({ getValue }) => <Stars rating={getValue()} />,
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("text", {
        header: () => <span>{t("mp.fields.review")}</span>,
        cell: ({ row }) => (
          <div className="flex h-full w-full max-w-[420px] items-center gap-x-2 overflow-hidden">
            {row.original.kind === "questions" ? (
              <ChatBubbleLeftRight className="text-ui-fg-subtle shrink-0" />
            ) : null}
            <span className="truncate">{row.original.text ?? "—"}</span>
          </div>
        ),
        meta: { phoneWide: true },
      }),
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <span className="truncate">
            {row.original.product.product_title ?? row.original.product.mp_title ?? "—"}
          </span>
        ),
      }),
      columnHelper.accessor("author", {
        header: () => <span>{t("mp.fields.author")}</span>,
        cell: ({ getValue }) => <span className="truncate">{getValue() ?? t("marketplaces.desk.anonymous")}</span>,
      }),
      columnHelper.accessor("created_at", {
        header: () => <span>{t("fields.date")}</span>,
        cell: ({ getValue }) => <DateTimeCell date={getValue()} />,
      }),
      columnHelper.display({
        id: "answer",
        header: () => <span>{t("mp.fields.answer")}</span>,
        cell: ({ row }) =>
          row.original.is_answered ? (
            <StatusCell color="green">{t("mp.answer.answered")}</StatusCell>
          ) : row.original.answer_draft ? (
            <StatusCell color="orange">{t("mp.answer.draft")}</StatusCell>
          ) : (
            <StatusCell color="red">{t("mp.answer.open")}</StatusCell>
          ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu
            groups={[
              {
                actions: [
                  {
                    icon: <PencilSquare />,
                    label: t("mp.reviews.actions.reply"),
                    onClick: () => onOpen(row.original),
                  },
                ],
              },
            ]}
          />
        ),
      }),
    ],
    [t, onOpen]
  )
}

const useFilters = (): Filter[] => {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        key: "kind",
        label: t("mp.fields.kind"),
        type: "select",
        multiple: true,
        options: [
          { label: t("mp.kind.reviews"), value: "reviews" },
          { label: t("mp.kind.questions"), value: "questions" },
        ],
      },
      {
        key: "answered",
        label: t("mp.fields.answer"),
        type: "select",
        options: [
          { label: t("mp.answer.open"), value: "no" },
          { label: t("mp.answer.answered"), value: "yes" },
        ],
      },
      {
        key: "rating",
        label: t("mp.fields.rating"),
        type: "select",
        multiple: true,
        options: [5, 4, 3, 2, 1].map((n) => ({ label: t("marketplaces.desk.filters.stars", { count: n }), value: String(n) })),
      },
      { key: "created_at", label: t("fields.date"), type: "date" },
    ],
    [t]
  )
}
