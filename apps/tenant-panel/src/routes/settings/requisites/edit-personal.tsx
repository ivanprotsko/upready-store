import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../components/settings"
import { RequisiteDateInput, RequisiteTextInput } from "./requisites-fields"
import { useRequisitesEdit } from "./use-requisites-edit"

// t-2026-10-14-01 (panel redesign, G1): drawer of «Персональные данные». The
// notice date is a date: the panel's DatePicker, not a text box. Route
// `edit-personal`.

const PersonalSchema = zod.object({
  dpo_email: zod.string().trim(),
  rkn_reg_number: zod.string().trim(),
  rkn_notice_date: zod.string().trim(),
})

export const RequisitesEditPersonal = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useRequisitesEdit()

  return (
    <SettingsEditDrawer
      title={t("requisitesSettings.sections.personal.title")}
      description={t("requisitesSettings.sections.personal.description")}
      isPending={isPending}
      schema={PersonalSchema}
      defaultValues={{
        dpo_email: saved.dpo_email,
        rkn_reg_number: saved.rkn_reg_number,
        rkn_notice_date: saved.rkn_notice_date,
      }}
      onSubmit={save}
      successMessage={t("requisitesSettings.saved")}
    >
      {(form) => (
        <>
          <RequisiteTextInput control={form.control} name="dpo_email" />
          <RequisiteTextInput control={form.control} name="rkn_reg_number" mono />
          <RequisiteDateInput control={form.control} name="rkn_notice_date" />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { RequisitesEditPersonal as Component }
