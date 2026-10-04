import { ChatBubbleLeftRight, PencilSquare, StarSolid } from "@medusajs/icons"
import { Alert, Text, clx } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import type { DeskItem } from "../../../hooks/api/marketplace-desk"
import {
  MARKETPLACE_LABEL,
  slugOf,
  useMpReviews,
  type MarketplaceId,
  type MpReviewsResponse,
} from "../../../hooks/api/marketplace-section"
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
 * here and the drawer says so in one sentence, word for word the backend's.
 *
 * The data is `GET /tenants/marketplaces/:marketplace/reviews` (task-05). The
 * open review is `?review=<id>` in the address, so a row is a link like every
 * row of the shop's tables, Back closes the drawer, and a review can be sent
 * to someone with its filters.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["kind", "rating", "answered", "created_at"] as const
const OPEN_KEY = "review"

/** The import outcomes worth a line above the table; the others are said by the empty list. */
const BANNER: Record<string, "warning" | "error"> = {
  failed: "error",
  rate_limited: "warning",
  fixture: "warning",
}

export const MpReviews = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { params, raw, dates } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)

  const { items, count, counts, generator, sending, connection, isLoading, isError, error } = useMpReviews(
    marketplace,
    { ...params, created_at: dates.created_at } as Parameters<typeof useMpReviews>[1],
    { placeholderData: keepPreviousData }
  )

  /** The list's own address with the open review set or cleared. */
  const addressWith = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(search)
      if (id) {
        next.set(OPEN_KEY, id)
      } else {
        next.delete(OPEN_KEY)
      }
      const query = next.toString()
      return `${pathname}${query ? `?${query}` : ""}`
    },
    [pathname, search]
  )

  const openId = new URLSearchParams(search).get(OPEN_KEY)
  const open = openId ? (items ?? []).find((item) => item.id === openId) ?? null : null

  const columns = useColumns(useCallback((item: DeskItem) => navigate(addressWith(item.id)), [navigate, addressWith]))
  const filters = useFilters()
  const { table } = useDataTable({
    data: items ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  // After every hook: a throw here hands the failure to the route's own
  // ErrorBoundary, and a hook below it would change the hook order.
  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  /** Nothing at all in our base for this marketplace, whatever the filters: the list says why. */
  const nothing = counts ? counts.reviews.total + counts.questions.total === 0 : false

  return (
    <MpPage
      title={t("mp.reviews.title")}
      subtitle={
        counts && !nothing
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
      {connection?.notice && BANNER[connection.notice] ? (
        <ConnectionBanner connection={connection} label={label} slug={slug} />
      ) : null}
      {nothing && connection ? (
        <EmptyReviews connection={connection} label={label} slug={slug} />
      ) : (
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
          navigateTo={(row) => addressWith(row.original.id)}
          orderBy={[
            { key: "created_at", label: t("fields.date") },
            { key: "rating", label: t("mp.fields.rating") },
          ]}
        />
      )}
      {open ? (
        <MpReviewDrawer
          key={open.id}
          item={open}
          generator={generator}
          readOnlyNote={sending?.reason ?? ""}
          onClose={() => navigate(addressWith(null), { replace: true })}
        />
      ) : null}
    </MpPage>
  )
}

type Connection = MpReviewsResponse["connection"]

/** A failed or throttled import, or recorded answers: said above the rows, not instead of them (rule 20a). */
const ConnectionBanner = ({ connection, label, slug }: { connection: Connection; label: string; slug: string }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const notice = connection.notice as string
  const at = connection.last_run?.finished_at ?? connection.last_run?.started_at ?? null

  return (
    <div className="px-6 py-4">
      <Alert variant={BANNER[notice]}>
        <div className="flex flex-col gap-y-1">
          <Text size="small">
            {t(`mp.reviews.connection.${notice}`, {
              marketplace: label,
              at: at ? getFullDate({ date: at, includeTime: true }) : "—",
              error: t(marketplaceErrorKey(connection.last_run?.error)),
            })}
          </Text>
          {notice !== "fixture" ? (
            <Link
              to={`/marketplaces/${slug}/sync`}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small w-fit"
            >
              {t("mp.reviews.links.sync")}
            </Link>
          ) : null}
          {notice === "failed" && connection.last_run?.error ? (
            <SupportDetails text={connection.last_run.error} />
          ) : null}
        </div>
      </Alert>
    </div>
  )
}

/**
 * Not one row in our base: no key, an import that never ran, one that never
 * succeeded, or a marketplace that sent nothing. Four causes, four sentences,
 * and the place to fix the first three.
 */
const EmptyReviews = ({ connection, label, slug }: { connection: Connection; label: string; slug: string }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  const reason = !connection.connected
    ? "missing"
    : !connection.last_run
      ? "never_run"
      : connection.last_success_at
        ? "none"
        : "never_succeeded"
  const at = reason === "none" ? connection.last_success_at : (connection.last_run?.started_at ?? null)

  return (
    <div data-testid="mp-reviews-empty" data-reason={reason}>
      <NoRecords
        className="h-[240px]"
        title={t(`mp.reviews.empty.${reason}.title`, { marketplace: label })}
        message={t(`mp.reviews.empty.${reason}.message`, {
          marketplace: label,
          at: at ? getFullDate({ date: at, includeTime: true }) : "—",
        })}
        action={
          reason === "missing"
            ? { to: `/settings/integrations/${slug}`, label: t("mp.reviews.links.connect") }
            : reason === "none"
              ? undefined
              : { to: `/marketplaces/${slug}/sync`, label: t("mp.reviews.links.sync") }
        }
      />
    </div>
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
          <div className="flex h-full w-full max-w-[360px] items-center gap-x-2 overflow-hidden">
            {row.original.kind === "questions" ? (
              <ChatBubbleLeftRight className="text-ui-fg-subtle shrink-0" />
            ) : null}
            {/* A WB rating often comes without words: the pros or cons stand in, else a dash. */}
            <span className="truncate">{row.original.text ?? row.original.pros ?? row.original.cons ?? "—"}</span>
          </div>
        ),
        meta: { phoneWide: true },
      }),
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <div className="flex h-full w-full max-w-[240px] items-center overflow-hidden">
            <span className="truncate">
              {row.original.product.product_title ?? row.original.product.mp_title ?? "—"}
            </span>
          </div>
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
