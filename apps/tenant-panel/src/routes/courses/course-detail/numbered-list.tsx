import { EllipsisHorizontal } from "@medusajs/icons"
import { IconButton, Table, Text } from "@medusajs/ui"
import { ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu, type ActionGroup } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"

// t-2026-10-14-01 (panel redesign, G4, prototype state `course`): the rows of
// the course card's lists, lessons and the three lists of the course page.
// A row is its number in the whole list, a title and one line under it, and
// the row's «…»; the title opens the row's drawer. Ten rows a page, with the
// pagination the panel's tables draw. Empty is `NoRecords` without a button:
// the section's header already has «Добавить» (rule 10).

export const LIST_PAGE_SIZE = 10

export type NumberedListProps<T> = {
  items: T[]
  getKey: (item: T, index: number) => string
  title: (item: T) => ReactNode
  /** The one line under the title. */
  sub?: (item: T) => ReactNode
  /** The drawer the row opens, relative to the card; none on a read-only card. */
  to?: (item: T, index: number) => string
  /** The row's «…»; none on a read-only card. */
  actions?: (item: T, index: number) => ActionGroup[]
  /** A heading drawn above the first row of each run of one group (lesson sections). */
  group?: (item: T) => string | null
  empty: { title: string; message: string }
  testId: string
}

export const NumberedList = <T,>({
  items,
  getKey,
  title,
  sub,
  to,
  actions,
  group,
  empty,
  testId,
}: NumberedListProps<T>) => {
  const { t } = useTranslation()
  const [pageIndex, setPageIndex] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE))

  // A deleted last row must not leave the owner on a page that no longer exists.
  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1)
    }
  }, [pageIndex, pageCount])

  if (items.length === 0) {
    return <NoRecords title={empty.title} message={empty.message} />
  }

  const start = pageIndex * LIST_PAGE_SIZE
  const page = items.slice(start, start + LIST_PAGE_SIZE)

  return (
    <div className="divide-y" data-testid={testId}>
      {page.map((item, offset) => {
        const index = start + offset
        const groupName = group?.(item) ?? null
        // The group's heading also tops a page, so a page never opens mid-section unnamed.
        const startsGroup =
          groupName !== null && (offset === 0 || group?.(items[index - 1] as T) !== groupName)
        const content = (
          <>
            <Text size="small" leading="compact" weight="plus" className="truncate">
              {title(item)}
            </Text>
            {sub ? (
              <Text size="small" leading="compact" className="text-ui-fg-subtle truncate">
                {sub(item)}
              </Text>
            ) : null}
          </>
        )
        const groups = actions?.(item, index)

        return (
          <div key={getKey(item, index)}>
            {startsGroup ? (
              <div className="bg-ui-bg-subtle px-6 py-2">
                <Text size="xsmall" leading="compact" weight="plus" className="text-ui-fg-subtle truncate">
                  {groupName}
                </Text>
              </div>
            ) : null}
            <div className="flex items-center gap-x-3 px-6 py-3" data-testid={`${testId}-row`}>
              <Text size="small" leading="compact" className="text-ui-fg-muted w-6 shrink-0 tabular-nums">
                {index + 1}
              </Text>
              {to ? (
                <Link
                  to={to(item, index)}
                  className="flex min-w-0 flex-1 flex-col gap-y-0.5 text-ui-fg-base hover:text-ui-fg-subtle transition-fg outline-none focus-visible:shadow-borders-focus rounded-md"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-y-0.5">{content}</div>
              )}
              {groups?.length ? (
                <ActionMenu groups={groups}>
                  <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
                    <EllipsisHorizontal />
                  </IconButton>
                </ActionMenu>
              ) : null}
            </div>
          </div>
        )
      })}
      {items.length > LIST_PAGE_SIZE ? (
        <Table.Pagination
          className="flex-shrink-0"
          count={items.length}
          pageSize={LIST_PAGE_SIZE}
          pageIndex={pageIndex}
          pageCount={pageCount}
          canPreviousPage={pageIndex > 0}
          canNextPage={pageIndex < pageCount - 1}
          previousPage={() => setPageIndex((current) => Math.max(0, current - 1))}
          nextPage={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
          translations={{
            of: t("general.of"),
            results: t("general.results"),
            pages: t("general.pages"),
            prev: t("general.prev"),
            next: t("general.next"),
          }}
        />
      ) : null}
    </div>
  )
}
