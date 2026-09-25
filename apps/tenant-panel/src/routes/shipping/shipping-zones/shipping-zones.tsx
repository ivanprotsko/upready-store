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

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
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

const regionWord = (count: number): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return "регион"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "региона"
  return "регионов"
}

export const ShippingZones = () => (
  // `useRouteModal` reads a context <RouteFocusModal> itself provides, so the
  // screen lives one component deeper — the same split `shipping-create` makes
  // between its route and `ShippingMethodForm`.
  <RouteFocusModal>
    <ZonesScreen />
  </RouteFocusModal>
)

const ZonesScreen = () => {
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
        `Создано способов доставки: ${result.created.length}` +
          (skipped ? `, пропущено (уже были): ${skipped}` : "")
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
            <Heading>Зоны доставки по России</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              Отметьте зоны и укажите цену для каждой. На каждую зону создаётся отдельный способ доставки:
              покупатель увидит только тот, в чью зону попадает его адрес.
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-10">
        <div className="flex w-full max-w-[900px] flex-col gap-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                Служба доставки
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
                  Покупатель увидит «{carrier.method_name} — Урал», «{carrier.method_name} — Юг» и так далее.
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                Минимальный вес заказа, г
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
                Заказ легче этого веса считается по нему. 0 — без минимума.
              </Text>
            </div>
          </div>

          {carrier && (
            <div className="rounded-lg border bg-ui-bg-subtle p-4">
              <div className="flex items-center gap-x-2">
                <InformationCircleSolid className="text-ui-fg-subtle" />
                <Text size="small" weight="plus">
                  Что делаете вручную
                </Text>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {carrier.instruction}
              </Text>
            </div>
          )}

          {isPending || !presets ? (
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем зоны…
            </Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-10" />
                  <Table.HeaderCell>Зона</Table.HeaderCell>
                  <Table.HeaderCell className="w-40">
                    Базовая ставка, {currency}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="w-40">
                    За килограмм, {currency}
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
                        title={exists ? "Такой способ уже создан" : preset.description}
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
                              {preset.regions.length}{" "}
                              {regionWord(preset.regions.length)}
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
          )}

          <Text size="small" className="text-ui-fg-subtle">
            Цена доставки = базовая ставка + цена за килограмм × вес заказа. Вес берётся из карточек
            товаров; у товара без веса подставляется вес по умолчанию со страницы «Доставка».
          </Text>
        </div>
      </RouteFocusModal.Body>
      <RouteFocusModal.Footer>
        <div className="flex items-center gap-x-2">
          <RouteFocusModal.Close asChild>
            <Button size="small" variant="secondary">
              Отмена
            </Button>
          </RouteFocusModal.Close>
          <Button
            size="small"
            onClick={save}
            disabled={!chosen.length || invalid}
            isLoading={isSaving}
            data-testid="zone-create-submit"
          >
            Создать способы ({chosen.length})
          </Button>
        </div>
      </RouteFocusModal.Footer>
    </>
  )
}
