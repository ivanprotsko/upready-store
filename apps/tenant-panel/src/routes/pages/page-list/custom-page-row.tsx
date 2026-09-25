import { useState } from "react"
import { ArrowDownMini, ArrowUpMini, Trash } from "@medusajs/icons"
import { Button, IconButton, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { Link } from "react-router-dom"

import { TenantPage, useDeleteTenantPage } from "../../../hooks/api/pages"
import { STATUS_COLOR, STATUS_LABEL, statusOf } from "../page-sections"
import { swapFooterOrder } from "./reorder-footer-page"

// t05-page-keys: one row of the panel's own page (a custom slug, never one of
// the five reserved ones — those keep the shape `page-list.tsx` always used).
// Split out of that file (component-decomposition guard: a delete-confirm
// toggle and a busy flag for reordering are state this row alone needs).

type CustomPageRowProps = {
  page: TenantPage
  publicUrl: string
  neighbourUp?: TenantPage
  neighbourDown?: TenantPage
}

export const CustomPageRow = ({
  page,
  publicUrl,
  neighbourUp,
  neighbourDown,
}: CustomPageRowProps) => {
  const status = statusOf(page)
  const [confirming, setConfirming] = useState(false)
  const [reordering, setReordering] = useState(false)

  const { mutateAsync: deletePage, isPending: isDeleting } = useDeleteTenantPage(page.key)

  const handleReorder = async (neighbour: TenantPage | undefined) => {
    if (!neighbour) return
    setReordering(true)
    try {
      await swapFooterOrder(page, neighbour)
    } catch (reorderError) {
      const message =
        reorderError instanceof Error ? reorderError.message : "Не удалось изменить порядок"
      toast.error(message)
    } finally {
      setReordering(false)
    }
  }

  return (
    <Table.Row>
      <Table.Cell>
        <Link to={page.key} className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg">
          <Text size="small" weight="plus" className="truncate" title={page.key}>
            {page.title.trim() || page.key}
          </Text>
        </Link>
      </Table.Cell>
      <Table.Cell>
        <Text size="small" className="text-ui-fg-subtle font-mono truncate" title={publicUrl}>
          {publicUrl}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <StatusBadge color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</StatusBadge>
      </Table.Cell>
      <Table.Cell>
        <div className="flex items-center gap-x-1">
          <Text size="small" className="text-ui-fg-subtle">
            {page.in_footer ? "Да" : "Нет"}
          </Text>
          {page.in_footer && (
            <div className="flex items-center">
              <IconButton
                size="small"
                variant="transparent"
                disabled={reordering || !neighbourUp}
                onClick={() => handleReorder(neighbourUp)}
              >
                <ArrowUpMini />
              </IconButton>
              <IconButton
                size="small"
                variant="transparent"
                disabled={reordering || !neighbourDown}
                onClick={() => handleReorder(neighbourDown)}
              >
                <ArrowDownMini />
              </IconButton>
            </div>
          )}
        </div>
      </Table.Cell>
      <Table.Cell>
        {confirming ? (
          <div className="flex items-center gap-x-1">
            <Button
              size="small"
              variant="danger"
              isLoading={isDeleting}
              onClick={() =>
                deletePage(undefined, {
                  onSuccess: () => toast.success("Страница удалена"),
                  onError: (deleteError) => toast.error(deleteError.message),
                })
              }
            >
              Удалить
            </Button>
            <Button size="small" variant="secondary" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        ) : (
          <IconButton size="small" variant="transparent" onClick={() => setConfirming(true)}>
            <Trash />
          </IconButton>
        )}
      </Table.Cell>
    </Table.Row>
  )
}
