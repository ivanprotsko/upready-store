import { zodResolver } from "@hookform/resolvers/zod"
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import {
  RouteFocusModal,
  useRouteModal,
} from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import {
  useShippingRegions,
  type ShippingMethodBody,
  type TenantShippingMethod,
} from "../../../../hooks/api/shipping-methods"
import { COUNTRY_LABEL, TARIFF_KIND_HINT, TARIFF_KIND_LABEL } from "../../labels"

// t04-shipping-tariffs: one form for create and edit. Built from the panel's
// own copied primitives (`Form`, `KeyboundForm`, `RouteFocusModal`) the way
// `pages/page-edit` is; no Admin counterpart (the Admin edits an option inside
// the location's fulfillment set, three drawers deep).

// Number fields are strings in the form (an <input type="number"> yields a
// string, and zod.coerce would split the form's input and output types) and
// are parsed once in `toBody`.
const number = (label: string) =>
  zod
    .string()
    .refine((value) => value.trim() !== "" && Number.isFinite(Number(value)), `${label}: введите число`)
    .refine((value) => Number(value) >= 0, `${label}: не меньше нуля`)

const num = (value: string): number => Math.round(Number(value) * 100) / 100

const ShippingMethodSchema = zod.object({
  name: zod.string().trim().min(1, "Название обязательно").max(120),
  description: zod.string().max(500),
  delivery_hint: zod.string().max(120),
  enabled: zod.boolean(),
  zone_mode: zod.enum(["all", "country", "regions"]),
  country_code: zod.string(),
  provinces: zod.array(zod.string()),
  kind: zod.enum(["flat", "per_kg", "free_above"]),
  amount: number("Цена"),
  base_amount: number("Базовая ставка"),
  per_kg_amount: number("Ставка за кг"),
  min_weight_g: number("Минимальный вес"),
  free_above_total: number("Порог суммы"),
})

type FormValues = zod.infer<typeof ShippingMethodSchema>

const toBody = (values: FormValues): ShippingMethodBody => {
  const tariff: ShippingMethodBody["tariff"] =
    values.kind === "flat"
      ? { kind: "flat", amount: num(values.amount) }
      : values.kind === "per_kg"
        ? {
            kind: "per_kg",
            base_amount: num(values.base_amount),
            per_kg_amount: num(values.per_kg_amount),
            min_weight_g: num(values.min_weight_g) > 0 ? Math.round(num(values.min_weight_g)) : null,
          }
        : {
            kind: "free_above",
            amount: num(values.amount),
            free_above_total: num(values.free_above_total),
          }
  const zone =
    values.zone_mode === "all"
      ? null
      : {
          country_code: values.country_code,
          provinces: values.zone_mode === "regions" ? values.provinces : [],
        }
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    delivery_hint: values.delivery_hint.trim() || null,
    enabled: values.enabled,
    zone,
    tariff,
  }
}

const fromMethod = (method?: TenantShippingMethod): FormValues => {
  const tariff = method?.tariff
  return {
    name: method?.name ?? "",
    description: method?.description ?? "",
    delivery_hint: method?.delivery_hint ?? "",
    enabled: method?.enabled ?? true,
    zone_mode: !method?.zone
      ? "all"
      : method.zone.provinces.length
        ? "regions"
        : "country",
    country_code: method?.zone?.country_code ?? "ru",
    provinces: method?.zone?.provinces ?? [],
    kind: tariff?.kind ?? "per_kg",
    amount: String(
      tariff?.kind === "flat" || tariff?.kind === "free_above" ? tariff.amount : 0
    ),
    base_amount: String(tariff?.kind === "per_kg" ? tariff.base_amount : 0),
    per_kg_amount: String(tariff?.kind === "per_kg" ? tariff.per_kg_amount : 0),
    min_weight_g: String(tariff?.kind === "per_kg" ? (tariff.min_weight_g ?? 0) : 0),
    free_above_total: String(tariff?.kind === "free_above" ? tariff.free_above_total : 0),
  }
}

type ShippingMethodFormProps = {
  method?: TenantShippingMethod
  currencyCode: string
  isPending: boolean
  onSubmit: (body: ShippingMethodBody) => Promise<void>
}

export const ShippingMethodForm = ({
  method,
  currencyCode,
  isPending,
  onSubmit,
}: ShippingMethodFormProps) => {
  const { handleSuccess } = useRouteModal()
  const form = useForm<FormValues>({
    defaultValues: fromMethod(method),
    resolver: zodResolver(ShippingMethodSchema),
  })

  const kind = form.watch("kind")
  const zoneMode = form.watch("zone_mode")
  const countryCode = form.watch("country_code")
  const provinces = form.watch("provinces")
  const { regions } = useShippingRegions(zoneMode === "regions" ? countryCode : null)
  const [regionFilter, setRegionFilter] = useState("")

  const visibleRegions = useMemo(() => {
    const needle = regionFilter.trim().toLowerCase()
    return needle
      ? regions.filter((region) => region.name.toLowerCase().includes(needle))
      : regions
  }, [regions, regionFilter])

  const currency = currencyCode.toUpperCase()

  const handleSubmit = form.handleSubmit(async (values) => {
    if (values.zone_mode === "regions" && values.provinces.length === 0) {
      form.setError("provinces", { message: "Отметьте хотя бы один регион" })
      return
    }
    try {
      await onSubmit(toBody(values))
      toast.success(method ? "Способ доставки сохранён" : "Способ доставки создан")
      handleSuccess()
    } catch (error) {
      toast.error((error as Error).message)
    }
  })

  const toggleProvince = (province: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...provinces, province]))
      : provinces.filter((value) => value !== province)
    form.setValue("provinces", next, { shouldDirty: true })
    form.clearErrors("provinces")
  }

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-16">
          <div className="flex w-full max-w-[720px] flex-col gap-y-8">
            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Название</Form.Label>
                  <Form.Hint>
                    Так способ доставки называется у покупателя в оформлении заказа, слово в слово.
                    Например: «Почтой России, 1–2 кг» или «Курьером по Москве».
                  </Form.Hint>
                  <Form.Control>
                    <Input {...field} placeholder="Почтой России" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="description"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>Описание</Form.Label>
                  <Form.Hint>Одна-две строки под названием: что входит, как забрать.</Form.Hint>
                  <Form.Control>
                    <Textarea {...field} rows={2} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="delivery_hint"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>Срок доставки</Form.Label>
                  <Form.Hint>Как есть, текстом: «3–7 дней», «на следующий день».</Form.Hint>
                  <Form.Control>
                    <Input {...field} placeholder="3–7 дней" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="zone_mode"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Куда доставляете этим способом</Form.Label>
                    <Form.Control>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <Select.Trigger ref={field.ref}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="all">Во все страны магазина</Select.Item>
                          <Select.Item value="country">В одну страну целиком</Select.Item>
                          <Select.Item value="regions">В выбранные регионы страны</Select.Item>
                        </Select.Content>
                      </Select>
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              {zoneMode !== "all" && (
                <Form.Field
                  control={form.control}
                  name="country_code"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>Страна</Form.Label>
                      <Form.Control>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value)
                            form.setValue("provinces", [])
                          }}
                        >
                          <Select.Trigger ref={field.ref}>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Content>
                            {Object.entries(COUNTRY_LABEL).map(([code, label]) => (
                              <Select.Item key={code} value={code}>
                                {label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              )}
              {zoneMode === "regions" && (
                <Form.Field
                  control={form.control}
                  name="provinces"
                  render={() => (
                    <Form.Item>
                      <Form.Label>Регионы</Form.Label>
                      <Form.Hint>
                        Покупатель увидит способ, только если регион его адреса отмечен здесь.
                        Отмечено: {provinces.length}.
                      </Form.Hint>
                      {regions.length === 0 ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          Для этой страны списка регионов пока нет. Выберите «В одну страну целиком».
                        </Text>
                      ) : (
                        <div className="flex flex-col gap-y-2">
                          <Input
                            placeholder="Найти регион"
                            value={regionFilter}
                            onChange={(event) => setRegionFilter(event.target.value)}
                          />
                          <div className="max-h-64 overflow-y-auto rounded-md border p-2">
                            {visibleRegions.map((region) => {
                              const id = `region-${region.code}`
                              const checked = provinces.includes(region.province)
                              return (
                                <div key={region.code} className="flex items-center gap-x-2 py-1">
                                  <Checkbox
                                    id={id}
                                    checked={checked}
                                    onCheckedChange={(value) => toggleProvince(region.province, value === true)}
                                  />
                                  <Label htmlFor={id} size="small" weight="regular">
                                    {region.name}
                                  </Label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              )}
            </div>

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Как считается цена</Form.Label>
                    <Form.Control>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <Select.Trigger ref={field.ref}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {(Object.keys(TARIFF_KIND_LABEL) as Array<keyof typeof TARIFF_KIND_LABEL>).map((value) => (
                            <Select.Item key={value} value={value}>
                              {TARIFF_KIND_LABEL[value]}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Form.Control>
                    <Form.Hint>{TARIFF_KIND_HINT[kind]}</Form.Hint>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              {kind === "flat" || kind === "free_above" ? (
                <Form.Field
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>Цена доставки, {currency}</Form.Label>
                      <Form.Control>
                        <Input {...field} type="number" step="0.01" min={0} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              ) : null}
              {kind === "per_kg" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Form.Field
                    control={form.control}
                    name="base_amount"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>Базовая ставка, {currency}</Form.Label>
                        <Form.Control>
                          <Input {...field} type="number" step="0.01" min={0} />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )}
                  />
                  <Form.Field
                    control={form.control}
                    name="per_kg_amount"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>За килограмм, {currency}</Form.Label>
                        <Form.Control>
                          <Input {...field} type="number" step="0.01" min={0} />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )}
                  />
                  <Form.Field
                    control={form.control}
                    name="min_weight_g"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label optional>Минимальный вес, г</Form.Label>
                        <Form.Control>
                          <Input {...field} type="number" step="1" min={0} />
                        </Form.Control>
                        <Form.Hint>Заказ легче этого веса считается по нему. 0 — без минимума.</Form.Hint>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )}
                  />
                </div>
              ) : null}
              {kind === "free_above" ? (
                <Form.Field
                  control={form.control}
                  name="free_above_total"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>Бесплатно при сумме товаров от, {currency}</Form.Label>
                      <Form.Control>
                        <Input {...field} type="number" step="0.01" min={0} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              ) : null}
            </div>

            <Form.Field
              control={form.control}
              name="enabled"
              render={({ field: { value, onChange, ...rest } }) => (
                <Form.Item>
                  <div className="flex items-center justify-between">
                    <Form.Label>Показывать покупателям</Form.Label>
                    <Form.Control>
                      <Switch {...rest} checked={value} onCheckedChange={onChange} />
                    </Form.Control>
                  </div>
                  <Form.Hint>Выключенный способ остаётся в списке, но в оформлении заказа не предлагается.</Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                Отмена
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              Сохранить
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
