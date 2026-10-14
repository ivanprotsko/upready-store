import type { TFunction } from "i18next"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { UseFormReturn, useWatch } from "react-hook-form"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../../../components/settings"
import { toNumber } from "../apiship-model"
import { ApishipSelectField, ApishipTextField, useApishipEdit, warnAfterSave } from "./apiship-fields"

// Drawer «Отправитель»: who hands the parcels over and from where. ApiShip
// refuses a shipment without the contact, the phone and the address, so the
// read page marks those three when they are empty — and so does the drawer,
// by the label, until the field is filled; the point id is asked only when
// the parcels are taken to a point. Route `edit/sender`.

const senderSchema = (t: TFunction) =>
  zod
    .object({
      sender_name: zod.string().trim().max(255),
      sender_company: zod.string().trim().max(100),
      sender_phone: zod.string().trim().max(30),
      sender_email: zod.string().trim().max(50),
      sender_city: zod.string().trim().max(100),
      sender_region: zod.string().trim().max(100),
      sender_address: zod.string().trim().max(255),
      sender_index: zod.string().trim().max(10),
      sender_mode: zod.enum(["courier", "point"]),
      sender_point_id: zod.string().trim(),
    })
    .refine((values) => values.sender_mode === "courier" || /^\d+$/.test(values.sender_point_id), {
      path: ["sender_point_id"],
      message: t("integrations.apiship.sender.pointIdRequired"),
    })

type SenderValues = zod.infer<ReturnType<typeof senderSchema>>

export const ApishipSenderDrawer = () => {
  const { t } = useTranslation()
  const { apiship, settings, isPending, save } = useApishipEdit()
  const schema = useMemo(() => senderSchema(t), [t])
  const missing = useMemo(() => new Set(apiship?.missing ?? []), [apiship?.missing])

  return (
    <SettingsEditDrawer
      title={t("integrations.apiship.sections.sender")}
      description={t("integrations.apiship.sections.senderHint")}
      isPending={isPending}
      schema={schema}
      defaultValues={{
        sender_name: settings?.sender_name ?? "",
        sender_company: settings?.sender_company ?? "",
        sender_phone: settings?.sender_phone ?? "",
        sender_email: settings?.sender_email ?? "",
        sender_city: settings?.sender_city ?? "",
        sender_region: settings?.sender_region ?? "",
        sender_address: settings?.sender_address ?? "",
        sender_index: settings?.sender_index ?? "",
        sender_mode: settings?.sender_mode ?? "courier",
        sender_point_id: settings?.sender_point_id ? String(settings.sender_point_id) : "",
      }}
      onSubmit={async ({ sender_point_id, ...values }) => {
        const answer = await save({
          ...values,
          sender_point_id: values.sender_mode === "point" ? toNumber(sender_point_id) : null,
        })
        warnAfterSave(t, answer)
      }}
      successMessage={t("integrations.apiship.saved")}
    >
      {(form) => <SenderFields form={form} missing={missing} />}
    </SettingsEditDrawer>
  )
}

const SenderFields = ({ form, missing }: { form: UseFormReturn<SenderValues>; missing: Set<string> }) => {
  const { t } = useTranslation()
  const mode = useWatch({ control: form.control, name: "sender_mode" })
  const label = (field: keyof SenderValues) => t(`integrations.apiship.sender.${field}`)
  // The same reason the read page gives, on the fields `missing` names.
  const needed = (field: keyof SenderValues) =>
    missing.has(field) ? t("integrations.apiship.neededToShip") : undefined

  return (
    <>
      <ApishipTextField control={form.control} name="sender_name" label={label("sender_name")} needed={needed("sender_name")} />
      <ApishipTextField control={form.control} name="sender_company" label={label("sender_company")} optional />
      <ApishipTextField
        control={form.control}
        name="sender_phone"
        type="tel"
        label={label("sender_phone")}
        placeholder="+7 900 000-00-00"
        needed={needed("sender_phone")}
      />
      <ApishipTextField control={form.control} name="sender_email" type="email" label={label("sender_email")} optional />
      <ApishipTextField control={form.control} name="sender_city" label={label("sender_city")} needed={needed("sender_city")} />
      <ApishipTextField control={form.control} name="sender_region" label={label("sender_region")} optional />
      <ApishipTextField
        control={form.control}
        name="sender_address"
        label={label("sender_address")}
        hint={t("integrations.apiship.sender.addressHint")}
        needed={needed("sender_address")}
      />
      <ApishipTextField
        control={form.control}
        name="sender_index"
        inputMode="numeric"
        mono
        label={label("sender_index")}
        optional
        needed={needed("sender_index")}
      />
      <ApishipSelectField
        control={form.control}
        name="sender_mode"
        label={label("sender_mode")}
        options={[
          { value: "courier", label: t("integrations.apiship.senderMode.courier") },
          { value: "point", label: t("integrations.apiship.senderMode.point") },
        ]}
      />
      {mode === "point" ? (
        <ApishipTextField
          control={form.control}
          name="sender_point_id"
          inputMode="numeric"
          mono
          label={label("sender_point_id")}
          hint={t("integrations.apiship.sender.pointIdHint")}
        />
      ) : null}
    </>
  )
}
