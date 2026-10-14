import { Heading, Text } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../../components/settings"
import { type ApishipCarrier, type ApishipKind, useApishipTariffs } from "../../../../../hooks/api/apiship"
import { hasPendingMethods, pendingReason } from "../apiship-model"
import { ApishipSelectField, useApishipEdit, warnAfterSave } from "./apiship-fields"

// Drawer «Способы на сайте»: per carrier, the two checkout methods (courier,
// pickup point) chosen or not, and the tariff — ApiShip's cheapest by default, or
// one the owner pins from the carrier's list. A carrier switched on but not
// connected in the ApiShip cabinet is refused by the route with the sentence
// that names it; the drawer shows that sentence and stays open. Route
// `edit/methods`.

const CHEAPEST = "cheapest"
const DEFAULT_CARRIERS = ["cdek", "rupost"]

const MethodsSchema = zod.object({
  carriers: zod.array(
    zod.object({
      provider_key: zod.string(),
      courier: zod.boolean(),
      pickup: zod.boolean(),
      tariff: zod.string(),
    })
  ),
})

type MethodsValues = zod.infer<typeof MethodsSchema>

/** The shop's carriers, and the two named ones before the first save made any. */
const carriersOf = (carriers: ApishipCarrier[] | undefined) => {
  const known = carriers ?? []
  const missing = DEFAULT_CARRIERS.filter((key) => !known.some((carrier) => carrier.provider_key === key))
  return [
    ...known,
    ...missing.map((key) => ({
      provider_key: key,
      label: key,
      kinds: [] as ApishipKind[],
      tariff_id: null,
      connection_id: null,
      methods: [],
    })),
  ]
}

export const ApishipMethodsDrawer = () => {
  const { t } = useTranslation()
  const { apiship, isPending, save } = useApishipEdit()
  const carriers = carriersOf(apiship?.carriers)

  return (
    <SettingsEditDrawer
      title={t("integrations.apiship.sections.methods")}
      description={t("integrations.apiship.sections.methodsHint")}
      isPending={isPending}
      schema={MethodsSchema}
      defaultValues={{
        carriers: carriers.map((carrier) => ({
          provider_key: carrier.provider_key,
          courier: carrier.kinds.includes("courier"),
          pickup: carrier.kinds.includes("pickup"),
          tariff: carrier.tariff_id ? String(carrier.tariff_id) : CHEAPEST,
        })),
      }}
      onSubmit={async (values) => {
        const answer = await save({
          carriers: values.carriers.map((entry) => ({
            provider_key: entry.provider_key,
            kinds: [
              ...(entry.courier ? (["courier"] as const) : []),
              ...(entry.pickup ? (["pickup"] as const) : []),
            ],
            tariff_id: entry.tariff === CHEAPEST ? null : Number(entry.tariff),
            connection_id:
              carriers.find((carrier) => carrier.provider_key === entry.provider_key)?.connection_id ?? null,
          })),
        })
        warnAfterSave(t, answer)
      }}
      successMessage={t("integrations.apiship.saved")}
    >
      {(form) => (
        <>
          {/* The switches are the owner's choice; the checkout follows once ApiShip can quote. */}
          {apiship && hasPendingMethods(apiship.carriers) ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="apiship-methods-pending">
              {pendingReason(t, apiship)}
            </Text>
          ) : null}
          {carriers.map((carrier, index) => (
            <CarrierFields
              key={carrier.provider_key}
              form={form}
              index={index}
              carrier={carrier}
              enabled={Boolean(apiship?.settings?.token.set)}
            />
          ))}
        </>
      )}
    </SettingsEditDrawer>
  )
}

const CarrierFields = ({
  form,
  index,
  carrier,
  enabled,
}: {
  form: UseFormReturn<MethodsValues>
  index: number
  carrier: { provider_key: string; label: string; tariff_id: number | null }
  enabled: boolean
}) => {
  const { t } = useTranslation()
  // The tariff list is ApiShip's: asked only when a token is stored.
  const { tariffs, isError } = useApishipTariffs(carrier.provider_key, { enabled })
  const label =
    carrier.label === carrier.provider_key
      ? t(`integrations.apiship.carrierLabel.${carrier.provider_key}`)
      : carrier.label

  const options = [
    { value: CHEAPEST, label: t("integrations.apiship.tariffCheapest") },
    ...(tariffs ?? []).map((tariff) => ({
      value: String(tariff.id),
      label: t("integrations.apiship.tariffOption", { name: tariff.name, id: tariff.id }),
    })),
  ]
  // A pinned tariff stays selectable while the list is loading or failed.
  if (carrier.tariff_id && !options.some((option) => option.value === String(carrier.tariff_id))) {
    options.push({
      value: String(carrier.tariff_id),
      label: t("integrations.apiship.tariffPinned", { id: carrier.tariff_id }),
    })
  }

  return (
    <section className="flex flex-col gap-y-3" data-testid={`apiship-methods-${carrier.provider_key}`}>
      <Heading level="h3">{label}</Heading>
      <SwitchBox
        control={form.control}
        name={`carriers.${index}.courier`}
        label={t("integrations.apiship.kind.courier")}
        description={t("integrations.apiship.kindHint.courier")}
      />
      <SwitchBox
        control={form.control}
        name={`carriers.${index}.pickup`}
        label={t("integrations.apiship.kind.pickup")}
        description={t("integrations.apiship.kindHint.pickup")}
      />
      <ApishipSelectField
        control={form.control}
        name={`carriers.${index}.tariff`}
        label={t("integrations.apiship.tariffLabel")}
        options={options}
      />
      {isError ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("integrations.apiship.tariffsUnavailable")}
        </Text>
      ) : null}
    </section>
  )
}
