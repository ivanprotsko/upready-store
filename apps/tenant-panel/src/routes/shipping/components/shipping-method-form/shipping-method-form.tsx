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
import type { TFunction } from "i18next"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import {
  RouteFocusModal,
  useRouteModal,
} from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import {
  useShippingRegions,
  useZonePresets,
  type ShippingMethodBody,
  type TenantShippingMethod,
} from "../../../../hooks/api/shipping-methods"
import {
  SHIPPING_COUNTRIES,
  TARIFF_KINDS,
  countryName,
  tariffKindHint,
  tariffKindLabel,
} from "../../labels"

// t04-shipping-tariffs: one form for create and edit. Built from the panel's
// own copied primitives (`Form`, `KeyboundForm`, `RouteFocusModal`) the way
// `pages/page-edit` is; no Admin counterpart (the Admin edits an option inside
// the location's fulfillment set, three drawers deep).
//
// t-2026-10-14-01 (panel redesign, G2): the layout stays as the audit left it
// («оставить»); every string is a `shippingMethods.form` key (panel-ds rule 7),
// so the schema is built with `t`.

// Number fields are strings in the form (an <input type="number"> yields a
// string, and zod.coerce would split the form's input and output types) and
// are parsed once in `toBody`.
type T = TFunction<"translation">

const number = (t: T, name: string) => {
  const field = t(`shippingMethods.form.numberFields.${name}`)
  return zod
    .string()
    .refine(
      (value) => value.trim() !== "" && Number.isFinite(Number(value)),
      t("shippingMethods.form.notNumber", { field })
    )
    .refine((value) => Number(value) >= 0, t("shippingMethods.form.negative", { field }))
}

const num = (value: string): number => Math.round(Number(value) * 100) / 100

const shippingMethodSchema = (t: T) =>
  zod.object({
    name: zod.string().trim().min(1, t("shippingMethods.form.nameRequired")).max(120),
    description: zod.string().max(500),
    delivery_hint: zod.string().max(120),
    enabled: zod.boolean(),
    carrier: zod.string(),
    zone_mode: zod.enum(["all", "country", "regions"]),
    country_code: zod.string(),
    provinces: zod.array(zod.string()),
    kind: zod.enum(["flat", "per_kg", "free_above"]),
    amount: number(t, "amount"),
    base_amount: number(t, "base_amount"),
    per_kg_amount: number(t, "per_kg_amount"),
    min_weight_g: number(t, "min_weight_g"),
    free_above_total: number(t, "free_above_total"),
  })

type FormValues = zod.infer<ReturnType<typeof shippingMethodSchema>>

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
    carrier: values.carrier || null,
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
    carrier: method?.carrier ?? "",
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
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const schema = useMemo(() => shippingMethodSchema(t), [t])
  const form = useForm<FormValues>({
    defaultValues: fromMethod(method),
    resolver: zodResolver(schema),
  })

  const kind = form.watch("kind")
  const zoneMode = form.watch("zone_mode")
  const countryCode = form.watch("country_code")
  const provinces = form.watch("provinces")
  const { regions } = useShippingRegions(zoneMode === "regions" ? countryCode : null)
  const { presets, carriers } = useZonePresets()
  const [regionFilter, setRegionFilter] = useState("")

  const visibleRegions = useMemo(() => {
    const needle = regionFilter.trim().toLowerCase()
    return needle
      ? regions.filter((region) => region.name.toLowerCase().includes(needle))
      : regions
  }, [regions, regionFilter])

  const carrierKey = form.watch("carrier")
  const selectedCarrier = (carriers ?? []).find((item) => item.key === carrierKey) ?? null

  const currency = currencyCode.toUpperCase()

  const handleSubmit = form.handleSubmit(async (values) => {
    if (values.zone_mode === "regions" && values.provinces.length === 0) {
      form.setError("provinces", { message: t("shippingMethods.form.regionsRequired") })
      return
    }
    try {
      await onSubmit(toBody(values))
      toast.success(method ? t("shippingMethods.toast.saved") : t("shippingMethods.toast.created"))
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
              name="carrier"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>{t("shippingMethods.form.carrier")}</Form.Label>
                  <Form.Hint>{t("shippingMethods.form.carrierHint")}</Form.Hint>
                  <Form.Control>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(value) => {
                        const key = value === "none" ? "" : value
                        field.onChange(key)
                        const carrier = (carriers ?? []).find((item) => item.key === key)
                        // A method being created takes the carrier's own copy;
                        // an existing one keeps whatever the owner already wrote.
                        if (carrier && !method && !form.getValues("name").trim()) {
                          form.setValue("name", carrier.method_name, { shouldDirty: true })
                          form.setValue("description", carrier.description, { shouldDirty: true })
                          form.setValue("delivery_hint", carrier.delivery_hint ?? "", {
                            shouldDirty: true,
                          })
                        }
                      }}
                    >
                      <Select.Trigger ref={field.ref} data-testid="method-carrier-select">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="none">{t("shippingMethods.form.carrierNone")}</Select.Item>
                        {(carriers ?? []).map((item) => (
                          <Select.Item key={item.key} value={item.key}>
                            {item.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            {selectedCarrier && (
              <Text size="small" className="text-ui-fg-subtle">
                {selectedCarrier.instruction}
              </Text>
            )}
            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("shippingMethods.form.name")}</Form.Label>
                  <Form.Hint>{t("shippingMethods.form.nameHint")}</Form.Hint>
                  <Form.Control>
                    <Input {...field} placeholder={t("shippingMethods.form.namePlaceholder")} />
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
                  <Form.Label optional>{t("shippingMethods.form.description")}</Form.Label>
                  <Form.Hint>{t("shippingMethods.form.descriptionHint")}</Form.Hint>
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
                  <Form.Label optional>{t("shippingMethods.form.deliveryTime")}</Form.Label>
                  <Form.Hint>{t("shippingMethods.form.deliveryTimeHint")}</Form.Hint>
                  <Form.Control>
                    <Input {...field} placeholder={t("shippingMethods.form.deliveryTimePlaceholder")} />
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
                    <Form.Label>{t("shippingMethods.form.zoneMode")}</Form.Label>
                    <Form.Control>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <Select.Trigger ref={field.ref}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="all">{t("shippingMethods.form.zoneModes.all")}</Select.Item>
                          <Select.Item value="country">{t("shippingMethods.form.zoneModes.country")}</Select.Item>
                          <Select.Item value="regions">{t("shippingMethods.form.zoneModes.regions")}</Select.Item>
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
                      <Form.Label>{t("shippingMethods.form.country")}</Form.Label>
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
                            {SHIPPING_COUNTRIES.map((code) => (
                              <Select.Item key={code} value={code}>
                                {countryName(t, code)}
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
                      <Form.Label>{t("shippingMethods.form.regions")}</Form.Label>
                      <Form.Hint>
                        {t("shippingMethods.form.regionsHint", { count: provinces.length })}
                      </Form.Hint>
                      {presets && presets.length > 0 && countryCode === "ru" && (
                        <div className="flex flex-wrap items-center gap-2 pb-2">
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {t("shippingMethods.form.presets")}
                          </Text>
                          {presets.map((preset) => (
                            <Button
                              key={preset.key}
                              type="button"
                              size="small"
                              variant="transparent"
                              className="border"
                              data-testid={`preset-${preset.key}`}
                              onClick={() => {
                                form.setValue("provinces", preset.provinces, { shouldDirty: true })
                                form.clearErrors("provinces")
                              }}
                            >
                              {preset.name}
                            </Button>
                          ))}
                        </div>
                      )}
                      {regions.length === 0 ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          {t("shippingMethods.form.noRegions")}
                        </Text>
                      ) : (
                        <div className="flex flex-col gap-y-2">
                          <Input
                            placeholder={t("shippingMethods.form.regionSearch")}
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
                    <Form.Label>{t("shippingMethods.form.kind")}</Form.Label>
                    <Form.Control>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <Select.Trigger ref={field.ref}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {TARIFF_KINDS.map((value) => (
                            <Select.Item key={value} value={value}>
                              {tariffKindLabel(t, value)}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Form.Control>
                    <Form.Hint>{tariffKindHint(t, kind)}</Form.Hint>
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
                      <Form.Label>{t("shippingMethods.form.amount", { currency })}</Form.Label>
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
                        <Form.Label>{t("shippingMethods.form.baseAmount", { currency })}</Form.Label>
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
                        <Form.Label>{t("shippingMethods.form.perKgAmount", { currency })}</Form.Label>
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
                        <Form.Label optional>{t("shippingMethods.form.minWeight")}</Form.Label>
                        <Form.Control>
                          <Input {...field} type="number" step="1" min={0} />
                        </Form.Control>
                        <Form.Hint>{t("shippingMethods.form.minWeightHint")}</Form.Hint>
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
                      <Form.Label>{t("shippingMethods.form.freeAboveTotal", { currency })}</Form.Label>
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
                    <Form.Label>{t("shippingMethods.form.enabled")}</Form.Label>
                    <Form.Control>
                      <Switch {...rest} checked={value} onCheckedChange={onChange} />
                    </Form.Control>
                  </div>
                  <Form.Hint>{t("shippingMethods.form.enabledHint")}</Form.Hint>
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
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
