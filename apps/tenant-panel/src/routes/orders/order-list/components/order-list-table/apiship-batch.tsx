import { HttpTypes } from "@medusajs/types"
import { Checkbox, toast } from "@medusajs/ui"
import { ColumnDef, createColumnHelper } from "@tanstack/react-table"
import { useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  type ApishipDocumentKind,
  type ApishipDocumentsResponse,
  downloadApishipFile,
  useApishipDocuments,
  useApishipStatusSync,
} from "../../../../../hooks/api/apiship"
import { apishipStatusKey, isNotYetWithCarrier } from "../../../../../lib/apiship-status"

// t-2026-10-14-58, part B, contract section 3: the orders list's batch. The
// owner ticks the rows and gets ONE label PDF for all of them, an act per
// carrier, or fresh statuses — up to 100 orders, the limit of the route. What
// did not work is named by order number: ApiShip's refusal per order, and the
// orders with no ApiShip shipment at all.

export const APISHIP_BATCH_LIMIT = 100

const columnHelper = createColumnHelper<HttpTypes.AdminOrder>()

/** The checkbox column the batch needs; a click on it does not open the order. */
export const useSelectColumn = (): ColumnDef<HttpTypes.AdminOrder, any> =>
  useMemo(
    () =>
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsSomePageRowsSelected() ? "indeterminate" : table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      }),
    []
  )

export const useApishipBatchCommands = (orders: HttpTypes.AdminOrder[] | undefined) => {
  const { t } = useTranslation()
  const { mutateAsync: fetchDocuments } = useApishipDocuments()
  const { mutateAsync: syncStatuses } = useApishipStatusSync()

  // The selection outlives a page; the numbers of the rows seen are kept to name them.
  const numbers = useRef(new Map<string, string>())
  for (const order of orders ?? []) {
    numbers.current.set(order.id, String(order.display_id))
  }
  const numberOf = (id: string) => `№ ${numbers.current.get(id) ?? id}`

  const selected = (selection: Record<string, boolean>) => {
    const ids = Object.keys(selection).filter((id) => selection[id])
    if (ids.length > APISHIP_BATCH_LIMIT) {
      toast.error(t("apishipShipment.batch.tooMany", { count: ids.length, limit: APISHIP_BATCH_LIMIT }))
      return null
    }
    return ids
  }

  const reportLeftovers = (answer: Pick<ApishipDocumentsResponse, "failed" | "without_shipment">) => {
    for (const failed of answer.failed) {
      const number = failed.display_id ? `№ ${failed.display_id}` : failed.order_id ? numberOf(failed.order_id) : ""
      const reason = isNotYetWithCarrier(failed.message) ? t("apishipShipment.notYetWithCarrier") : failed.message
      toast.error(t("apishipShipment.batch.failed", { order: number, reason }))
    }
    if (answer.without_shipment.length) {
      toast.warning(
        t("apishipShipment.batch.withoutShipment", {
          orders: answer.without_shipment.map(numberOf).join(", "),
        })
      )
    }
  }

  const documents = (kind: ApishipDocumentKind) => async (selection: Record<string, boolean>) => {
    const ids = selected(selection)
    if (!ids) return
    try {
      const answer = await fetchDocuments({ kind, order_ids: ids })
      const stamp = new Date().toISOString().slice(0, 10)
      for (const file of answer.files) {
        const suffix = file.provider_key ? `-${file.provider_key}` : ""
        await downloadApishipFile(file.download, `apiship-${kind}-${stamp}${suffix}.pdf`)
      }
      if (answer.files.length) {
        const count = answer.files.reduce((sum, file) => sum + file.order_ids.length, 0)
        toast.success(t(`apishipShipment.batch.${kind}Ready`, { count }))
      }
      reportLeftovers(answer)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const sync = async (selection: Record<string, boolean>) => {
    const ids = selected(selection)
    if (!ids) return
    try {
      const answer = await syncStatuses({ order_ids: ids })
      toast.success(t("apishipShipment.batch.synced", { checked: answer.checked, updated: answer.updated }))
      for (const result of answer.results.filter((entry) => entry.error)) {
        toast.error(
          t("apishipShipment.batch.syncFailed", {
            shipment: result.apiship_order_id ?? result.fulfillment_id,
            status: t(apishipStatusKey(result.status)),
            reason: result.error,
          })
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return [
    { label: t("apishipShipment.batch.labels"), shortcut: "l", action: documents("labels") },
    { label: t("apishipShipment.batch.waybills"), shortcut: "w", action: documents("waybills") },
    { label: t("apishipShipment.batch.sync"), shortcut: "s", action: sync },
  ]
}
