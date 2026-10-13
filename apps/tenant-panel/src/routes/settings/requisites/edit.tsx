import { Hint } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../components/settings"
import { RequisiteTextInput } from "./requisites-fields"
import { useRequisitesEdit } from "./use-requisites-edit"

// t-2026-10-14-01 (panel redesign, G1): drawer of the first requisites section,
// «Реквизиты продавца» — who sells. Route `edit`.

const SellerSchema = zod.object({
  legal_name: zod.string().trim(),
  inn: zod.string().trim(),
  ogrn: zod.string().trim(),
  legal_address: zod.string().trim(),
})

export const RequisitesEditSeller = () => {
  const { t } = useTranslation()
  const { saved, isPending, save } = useRequisitesEdit()

  return (
    <SettingsEditDrawer
      title={t("requisitesSettings.title")}
      isPending={isPending}
      schema={SellerSchema}
      defaultValues={{
        legal_name: saved.legal_name,
        inn: saved.inn,
        ogrn: saved.ogrn,
        legal_address: saved.legal_address,
      }}
      onSubmit={save}
      successMessage={t("requisitesSettings.saved")}
    >
      {(form) => (
        <>
          <RequisiteTextInput control={form.control} name="legal_name" hint />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RequisiteTextInput control={form.control} name="inn" mono />
            <RequisiteTextInput control={form.control} name="ogrn" mono />
          </div>
          <RequisiteTextInput control={form.control} name="legal_address" multiline />
          <Hint variant="info">{t("requisitesSettings.sections.seller.drawerHint")}</Hint>
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { RequisitesEditSeller as Component }
