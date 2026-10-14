import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../../components/settings"
import { ApishipTextField, useApishipEdit, warnAfterSave } from "./apiship-fields"

// Drawer «Подключение»: the token and the switch. An empty token field keeps
// the stored one: the token is never shown, so it is never re-typed to save.
// Route `edit/connection`.

const ConnectionSchema = zod.object({
  token: zod.string().trim().max(500),
  is_enabled: zod.boolean(),
})

export const ApishipConnectionDrawer = () => {
  const { t } = useTranslation()
  const { settings, isPending, save } = useApishipEdit()
  const stored = settings?.token.set ?? false

  return (
    <SettingsEditDrawer
      title={t("integrations.apiship.sections.connection")}
      description={t("integrations.apiship.sections.connectionHint")}
      isPending={isPending}
      schema={ConnectionSchema}
      defaultValues={{ token: "", is_enabled: settings?.is_enabled ?? true }}
      onSubmit={async (values) => {
        const answer = await save({ token: values.token || undefined, is_enabled: values.is_enabled })
        warnAfterSave(t, answer)
      }}
      successMessage={t("integrations.apiship.saved")}
    >
      {(form) => (
        <>
          <ApishipTextField
            control={form.control}
            name="token"
            type="password"
            mono
            label={t("integrations.apiship.tokenLabel")}
            hint={t("integrations.apiship.tokenHint")}
            placeholder={
              stored
                ? t("integrations.apiship.keepPlaceholder", { last4: settings?.token.last4 ?? "" })
                : t("integrations.apiship.emptyPlaceholder")
            }
          />
          <SwitchBox
            control={form.control}
            name="is_enabled"
            label={t("integrations.apiship.enabledLabel")}
            description={t("integrations.apiship.enabledHint")}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
