import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../components/settings"
import { RequisiteTextInput } from "./requisites-fields"
import { useRequisitesEdit } from "./use-requisites-edit"

// t-2026-10-14-01 (panel redesign, G1): drawer of «Прочее». The site domain is
// not here: it is resolved from the shop's primary address and changed in
// «Адрес магазина». Route `edit-other`.

const OtherSchema = zod.object({
  newsletter_management_url: zod.string().trim(),
  bank_details: zod.string().trim(),
})

export const RequisitesEditOther = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useRequisitesEdit()

  return (
    <SettingsEditDrawer
      title={t("requisitesSettings.sections.other.title")}
      description={t("requisitesSettings.sections.other.description")}
      isPending={isPending}
      schema={OtherSchema}
      defaultValues={{
        newsletter_management_url: saved.newsletter_management_url,
        bank_details: saved.bank_details,
      }}
      onSubmit={save}
      successMessage={t("requisitesSettings.saved")}
    >
      {(form) => (
        <>
          <RequisiteTextInput control={form.control} name="newsletter_management_url" mono />
          <RequisiteTextInput control={form.control} name="bank_details" multiline hint />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { RequisitesEditOther as Component }
