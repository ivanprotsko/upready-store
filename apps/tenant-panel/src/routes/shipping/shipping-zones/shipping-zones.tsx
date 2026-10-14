import { useMemo, useState } from "react"
import {
  Button,
  Checkbox,
  Heading,
  Input,
  Select,
  Table,
  Text,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { InformationCircleSolid } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { TableScroll } from "../../../components/table/table-scroll"
import {
  useCreateZoneMethods,
  useZonePresets,
  type ZonePreset,
} from "../../../hooks/api/shipping-methods"

// b03-shipping-zones-weight: the screen Oksana actually asked for — one table,
// nine Russian zones, a price per kilogram in each («цена за кг по зонам»,
// обращение #463839). Saving it creates one ordinary delivery method per
// checked zone, which she then edits, renames or deletes on /shipping like any
// other. Nothing here is a new kind of row in the database.
//
// Built from `@medusajs/ui` like every other screen of this panel (it is a copy
// of Medusa Admin 2.19); the workspace Geist canon governs our own surfaces,
// not this vendored admin.
//
// t-2026-10-14-01 (panel redesign, G2): the layout stays as the audit left it
// («оставить»); every string is a `shippingMethods.zones` key (panel-ds rule 7).

/** Starting prices, so the table is never empty: the further the zone, the dearer the kilogram. */
const SUGGESTED: Record<string, { base: number; perKg: number }> = {
  msk: { base: 150, perKg: 120 },
  spb: { base: 150, perKg: 140 },
  center: { base: 150, perKg: 160 },
  northwest: { base: 150, perKg: 180 },
  south: { base: 150, perKg: 190 },
  volga: { base: 150, perKg: 190 },
  ural: { base: 150, perKg: 210 },
  siberia: { base: 150, perKg: 240 },
  fareast: { base: 150, perKg: 290 },
}

type Row = {
  checked: boolean
  base: string
  perKg: string
}

const isMoney = (value: string): boolean =>
  value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0

const money = (value: string): number => Math.round(Number(value) * 100) / 100

export const ShippingZones = () => (
  // `useRouteModal` reads a context <RouteFocusModal> itself provides, so the
  // screen lives one component deeper — the same split `shipping-create` makes
  // between its route and `ShippingMethodForm`.
  <RouteFocusModal>
    <ZonesScreen />
  </RouteFocusModal>
)

const ZonesScreen = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const {
    presets,
    carriers,
    currency_code,
    existing_names,
    isPending,
    isError,
    error,
  } = useZonePresets()
  const { mutateAsync, isPending: isSaving } = useCreateZoneMethods()

  const [carrierKey, setCarrierKey] = useState("cdek")
  const [minWeight, setMinWeight] = useState("0")
  const [rows, setRows] = useState<Record<string, Row>>({})

  if (isError) {
    throw error
  }

  const carrier = carriers?.find((item) => item.key === carrierKey) ?? null
  const currency = (currency_code ?? "rub").toUpperCase()
  const baseName = carrier?.method_name ?? ""

  const rowOf = (preset: ZonePreset): Row =>
    rows[preset.key] ?? {
      checked: true,
      base: String(SUGGESTED[preset.key]?.base ?? 150),
      perKg: String(SUGGESTED[preset.key]?.perKg ?? 200),
    }

  const setRow = (key: string, patch: Partial<Row>, preset: ZonePreset) => {
    setRows((current) => ({ ...current, [key]: { ...rowOf(preset), ...patch } }))
  }

  const alreadyThere = (preset: ZonePreset): boolean =>
    (existing_names ?? []).includes(`${baseName} — ${preset.name}`)

  const chosen = useMemo(
    () =>
      (presets ?? []).filter(
        (preset) => rowOf(preset).checked && !alreadyThere(preset)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presets, rows, existing_names, baseName]
  )

  const invalid = chosen.some(
    (preset) => !isMoney(rowOf(preset).base) || !isMoney(rowOf(preset).perKg)
  )

  const save = async () => {
    if (!carrier) {
      return
    }
    try {
      const result = await mutateAsync({
        carrier: carrier.key,
        enabled: true,
        zones: chosen.map((preset) => ({
          key: preset.key,
          base_amount: money(rowOf(preset).base),
          per_kg_amount: money(rowOf(preset).perKg),
          min_weight_g:
            isMoney(minWeight) && Number(minWeight) > 0
              ? Math.round(Number(minWeight))
              : null,
        })),
      })
      const skipped = result.skipped.length
      toast.success(
        skipped
          ? t("shippingMethods.zones.createdSkipped", {
              count: result.created.length,
              skipped,
            })
          : t("shippingMethods.zones.created", { count: result.created.length })
      )
      handleSuccess()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{t("shippingMethods.zones.title")}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              {t("shippingMethods.zones.description")}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-10">
        <div className="flex w-full max-w-[900px] flex-col gap-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                {t("shippingMethods.zones.carrier")}
              </Text>
              <Select value={carrierKey} onValueChange={setCarrierKey}>
                <Select.Trigger data-testid="zone-carrier-select">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {(carriers ?? []).map((item) => (
                    <Select.Item key={item.key} value={item.key}>
                      {item.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {carrier && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("shippingMethods.zones.carrierExample", { name: carrier.method_name })}
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                {t("shippingMethods.zones.minWeight")}
              </Text>
              <Input
                type="number"
                min={0}
                step={100}
                value={minWeight}
                onChange={(event) => setMinWeight(event.target.value)}
                className="w-40"
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("shippingMethods.zones.minWeightHint")}
              </Text>
            </div>
          </div>

          {carrier && (
            <div className="rounded-lg border bg-ui-bg-subtle p-4">
              <div className="flex items-center gap-x-2">
                <InformationCircleSolid className="text-ui-fg-subtle" />
                <Text size="small" weight="plus">
                  {t("shippingMethods.zones.manual")}
                </Text>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {carrier.instruction}
              </Text>
            </div>
          )}

          {isPending || !presets ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("shippingMethods.zones.loading")}
            </Text>
          ) : (
            <TableScroll>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell className="w-10" />
                    <Table.HeaderCell>{t("shippingMethods.zones.zone")}</Table.HeaderCell>
                    <Table.HeaderCell className="w-40">
                      {t("shippingMethods.zones.baseAmount", { currency })}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="w-40">
                      {t("shippingMethods.zones.perKgAmount", { currency })}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {presets.map((preset) => {
                    const row = rowOf(preset)
                    const exists = alreadyThere(preset)
                    return (
                      <Table.Row
                        key={preset.key}
                        data-testid={`zone-row-${preset.key}`}
                      >
                        <Table.Cell>
                          <Checkbox
                            checked={row.checked && !exists}
                            disabled={exists}
                            onCheckedChange={(value) =>
                              setRow(preset.key, { checked: value === true }, preset)
                            }
                            aria-label={preset.name}
                          />
                        </Table.Cell>
                        <Table.Cell
                          title={exists ? t("shippingMethods.zones.exists") : preset.description}
                        >
                          <div className="flex items-center gap-x-2">
                            <Text size="small" weight="plus" className="truncate">
                              {preset.name}
                            </Text>
                            <Tooltip
                              content={preset.regions
                                .map((region) => region.name)
                                .join(", ")}
                            >
                              <Text size="xsmall" className="text-ui-fg-muted text-nowrap">
                                {t("shippingMethods.zones.regionCount", {
                                  count: preset.regions.length,
                                })}
                              </Text>
                            </Tooltip>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.base}
                            disabled={!row.checked || exists}
                            onChange={(event) =>
                              setRow(preset.key, { base: event.target.value }, preset)
                            }
                            aria-invalid={!isMoney(row.base)}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.perKg}
                            disabled={!row.checked || exists}
                            onChange={(event) =>
                              setRow(preset.key, { perKg: event.target.value }, preset)
                            }
                            aria-invalid={!isMoney(row.perKg)}
                          />
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
            </TableScroll>
          )}

          <Text size="small" className="text-ui-fg-subtle">
            {t("shippingMethods.zones.formula")}
          </Text>
        </div>
      </RouteFocusModal.Body>
      <RouteFocusModal.Footer>
        <div className="flex items-center gap-x-2">
          <RouteFocusModal.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </RouteFocusModal.Close>
          <Button
            size="small"
            onClick={save}
            disabled={!chosen.length || invalid}
            isLoading={isSaving}
            data-testid="zone-create-submit"
          >
            {t("shippingMethods.zones.submit", { count: chosen.length })}
          </Button>
        </div>
      </RouteFocusModal.Footer>
    </>
  )
}
