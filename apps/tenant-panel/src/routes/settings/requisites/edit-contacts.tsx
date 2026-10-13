import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../components/settings"
import { RequisiteTextInput } from "./requisites-fields"
import { useRequisitesEdit } from "./use-requisites-edit"

// t-2026-10-14-01 (panel redesign, G1): drawer of «Контакты и доставка». The
// «подтвердить» link that stood under the phone field is the switch here.
// Route `edit-contacts`.

const ContactsSchema = zod.object({
  phone: zod.string().trim(),
  phone_confirmed: zod.boolean(),
  email: zod.string().trim(),
  return_address: zod.string().trim(),
  delivery_methods: zod.string().trim(),
})

export const RequisitesEditContacts = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useRequisitesEdit()

  return (
    <SettingsEditDrawer
      title={t("requisitesSettings.sections.contacts.title")}
      description={t("requisitesSettings.sections.contacts.description")}
      isPending={isPending}
      schema={ContactsSchema}
      defaultValues={{
        phone: saved.phone,
        phone_confirmed: saved.phone_confirmed,
        email: saved.email,
        return_address: saved.return_address,
        delivery_methods: saved.delivery_methods,
      }}
      onSubmit={save}
      successMessage={t("requisitesSettings.saved")}
    >
      {(form) => <ContactsFields form={form} />}
    </SettingsEditDrawer>
  )
}

const ContactsFields = ({ form }: { form: UseFormReturn<zod.infer<typeof ContactsSchema>> }) => {
  const { t } = useTranslation()
  const phone = useWatch({ control: form.control, name: "phone" })

  return (
    <>
      <RequisiteTextInput control={form.control} name="phone" />
      {phone.trim() ? (
        <SwitchBox
          control={form.control}
          name="phone_confirmed"
          label={t("requisitesSettings.phoneConfirmed.label")}
          description={t("requisitesSettings.phoneConfirmed.hint")}
        />
      ) : null}
      <RequisiteTextInput control={form.control} name="email" />
      <RequisiteTextInput control={form.control} name="return_address" multiline optional />
      <RequisiteTextInput control={form.control} name="delivery_methods" hint />
    </>
  )
}

export { RequisitesEditContacts as Component }
