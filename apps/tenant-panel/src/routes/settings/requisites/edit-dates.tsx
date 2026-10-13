import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../components/settings"
import { RequisiteDateInput } from "./requisites-fields"
import { useRequisitesEdit } from "./use-requisites-edit"

// t-2026-10-14-01 (panel redesign, G1): drawer of «Даты документов» — three
// dates, each the panel's DatePicker (the design system forbids the native date
// input). Route `edit-dates`.

const DatesSchema = zod.object({
  document_date: zod.string().trim(),
  effective_date: zod.string().trim(),
  revision_date: zod.string().trim(),
})

export const RequisitesEditDates = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useRequisitesEdit()

  return (
    <SettingsEditDrawer
      title={t("requisitesSettings.sections.dates.title")}
      description={t("requisitesSettings.sections.dates.description")}
      isPending={isPending}
      schema={DatesSchema}
      defaultValues={{
        document_date: saved.document_date,
        effective_date: saved.effective_date,
        revision_date: saved.revision_date,
      }}
      onSubmit={save}
      successMessage={t("requisitesSettings.saved")}
    >
      {(form) => (
        <>
          <RequisiteDateInput control={form.control} name="document_date" />
          <RequisiteDateInput control={form.control} name="effective_date" />
          <RequisiteDateInput control={form.control} name="revision_date" />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { RequisitesEditDates as Component }
