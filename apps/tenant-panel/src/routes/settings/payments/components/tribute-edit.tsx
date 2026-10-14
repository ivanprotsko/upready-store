import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useSaveTenantTribute, useTenantTribute } from "../../../../hooks/api/tribute"
import { tributeDraftErrors, tributeDraftFrom, tributePayload } from "../../../../lib/tribute-settings"

// t-2026-10-14-01 (panel redesign, G3, prototype state `payments-tribute-edit`):
// the drawer of the Tribute requisites, route `/settings/payments/tribute/edit`.
// The key field starts empty, as on the old card: typed, it replaces the
// stored key; left empty, the stored one stays. The check is the old card's
// (`tributeDraftErrors`, the backend's own rule): switching Tribute on needs a
// key, typed or stored, and the owner reads why next to the field.

export const TributeEdit = () => {
  const { t } = useTranslation()
  const { tribute, isPending, isError, error } = useTenantTribute()
  const { mutateAsync } = useSaveTenantTribute()

  if (isError) {
    throw error
  }

  const settings = tribute?.settings ?? null

  const schema = zod
    .object({ enabled: zod.boolean(), api_key: zod.string() })
    .superRefine((draft, ctx) => {
      for (const [field, key] of Object.entries(tributeDraftErrors(draft, settings))) {
        ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
      }
    })

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.tribute.drawerTitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={tributeDraftFrom(settings)}
      onSubmit={(draft) => mutateAsync(tributePayload(draft))}
      successMessage={t("tribute.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="api_key"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("paymentMethods.accessKey")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    data-testid="tribute-api_key"
                    placeholder={
                      settings?.api_key.set
                        ? t("paymentMethods.keepKey", { last4: settings.api_key.last4 ?? "" })
                        : t("tribute.emptyPlaceholder")
                    }
                  />
                </Form.Control>
                <Form.Hint>{t("paymentMethods.tribute.keyHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <SwitchBox
            control={form.control}
            name="enabled"
            label={t("tribute.fields.is_enabled")}
            description={t("paymentMethods.tribute.enabledHint")}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
