import { Select, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  useUpdateWbWarehouseMapping,
  type WbWritePreviewResponse,
} from "../../../../hooks/api/wb-write-preview"

/**
 * The pairing "stock location of the shop -> WB seller warehouse"
 * (w21-wb-write-stocks-prices).
 *
 * Wildberries keeps inventory per seller warehouse and the warehouse id is in
 * the PATH of the update method, so without this pairing the stock diff has
 * nothing to compare and says so. It is shown for EVERY location, not only the
 * unmapped ones: a wrong pairing is the one mistake here that would put the
 * shop's quantities on a stranger's warehouse, so it stays visible and
 * changeable rather than being set once and hidden.
 *
 * What this writes is the shop's own stock location. Nothing is sent to
 * Wildberries from this panel at all.
 */
export const WbWarehouseMapping = ({
  preview,
}: {
  preview: WbWritePreviewResponse
}) => {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useUpdateWbWarehouseMapping()

  const save = async (stockLocationId: string, warehouseId: string) => {
    try {
      await mutateAsync({
        warehouses: [
          {
            stock_location_id: stockLocationId,
            wb_warehouse_id: warehouseId === "" ? null : warehouseId,
          },
        ],
      })
      toast.success(t("wildberries.preview.mapping.saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <Text size="small" weight="plus">
        {t("wildberries.preview.mapping.title")}
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.preview.mapping.hint")}
      </Text>

      {preview.locations.map((location) => (
        <div
          key={location.stock_location_id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <Text size="small">{location.stock_location_name}</Text>
          <div className="min-w-[280px]">
            <Select
              value={location.wb_warehouse_id ?? ""}
              disabled={isPending}
              onValueChange={(value) => save(location.stock_location_id, value)}
            >
              <Select.Trigger>
                <Select.Value placeholder={t("wildberries.preview.mapping.none")} />
              </Select.Trigger>
              <Select.Content>
                {preview.warehouses.map((warehouse) => (
                  <Select.Item key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                    {warehouse.warehouse_name ?? warehouse.warehouse_id} (
                    {warehouse.warehouse_id})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
      ))}

      {preview.unmapped_locations.length ? (
        <Text size="small" className="text-ui-fg-subtle">
          {t("wildberries.preview.mapping.unmapped", {
            count: preview.unmapped_locations.length,
          })}
        </Text>
      ) : null}
    </div>
  )
}
