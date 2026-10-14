import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useSaveTenantBitcart, useTenantBitcart } from "../../../../hooks/api/bitcart"
import { bitcartDraftErrors, bitcartDraftFrom, bitcartPayload } from "../../../../lib/bitcart-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"
import { MethodTextField } from "./method-text-field"

// t-2026-10-14-01 (panel redesign, G3): the drawer of the Bitcart requisites,
// route `/settings/payments/bitcart/edit`, after the BTCPay drawer with
// Bitcart's fields. The checks (`bitcartDraftErrors`) and the body
// (`bitcartPayload`) are the old card's: the key starts empty and empty keeps
// the stored one; switching on needs all four values.

const BitcartBaseSchema = zod.object({
  enabled: zod.boolean(),
  server_url: zod.string(),
  admin_url: zod.string(),
  store_id: zod.string(),
  api_key: zod.string(),
})

export const BitcartEdit = () => {
  const { t } = useTranslation()
  const { bitcart, isPending, isError, error } = useTenantBitcart()
  const { mutateAsync } = useSaveTenantBitcart()

  if (isError) {
    throw error
  }

  const settings = bitcart?.settings ?? null
  const schema = BitcartBaseSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(bitcartDraftErrors(draft, settings))) {
      ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
    }
  })

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.bitcart.drawerTitle")}
      description={t("bitcart.ownServerHint")}
      isPending={isPending}
      schema={schema}
      defaultValues={bitcartDraftFrom(settings)}
      onSubmit={(draft) => mutateAsync(bitcartPayload(draft))}
      successMessage={t("bitcart.saved")}
    >
      {(form) => (
        <>
          {bitcart?.unreadable ? <UnreadableSecretAlert testId="bitcart-unreadable" /> : null}
          <SwitchBox
            control={form.control}
            name="enabled"
            label={t("bitcart.fields.is_enabled")}
            description={t("paymentMethods.enabledHint")}
          />
          <MethodTextField
            control={form.control}
            name="server_url"
            label={t("bitcart.fields.server_url")}
            placeholder={t("paymentMethods.bitcart.serverUrlPlaceholder")}
            mono
            testId="bitcart-server_url"
          />
          <MethodTextField
            control={form.control}
            name="admin_url"
            label={t("bitcart.fields.admin_url")}
            hint={t("bitcart.addressHint")}
            placeholder={t("paymentMethods.bitcart.adminUrlPlaceholder")}
            mono
            testId="bitcart-admin_url"
          />
          <MethodTextField
            control={form.control}
            name="store_id"
            label={t("paymentMethods.bitcart.storeId")}
            placeholder={t("paymentMethods.bitcart.storeIdPlaceholder")}
            mono
            testId="bitcart-store_id"
          />
          <MethodTextField
            control={form.control}
            name="api_key"
            label={t("paymentMethods.accessKey")}
            hint={t("bitcart.apiKeyHint")}
            placeholder={
              settings?.api_key?.set
                ? t("paymentMethods.keepKey", { last4: settings.api_key.last4 ?? "" })
                : t("bitcart.emptyPlaceholder")
            }
            secret
            testId="bitcart-api_key"
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
