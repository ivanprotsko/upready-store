import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useSaveTenantBtcpay, useTenantBtcpay } from "../../../../hooks/api/btcpay"
import type { MaskedSecret } from "../../../../hooks/api/payment-settings"
import { btcpayDraftErrors, btcpayDraftFrom, btcpayPayload } from "../../../../lib/btcpay-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"
import { MethodTextField } from "./method-text-field"

// t-2026-10-14-01 (panel redesign, G3): the drawer of the BTCPay requisites,
// route `/settings/payments/btcpay/edit` — the prototype's «повтор drawer
// Tribute с их полями». The fields, the checks (`btcpayDraftErrors`) and the
// body (`btcpayPayload`) are the old card's: the two secrets start empty and
// empty keeps the stored value; switching on needs all four values.

const BtcpayBaseSchema = zod.object({
  enabled: zod.boolean(),
  server_url: zod.string(),
  store_id: zod.string(),
  api_key: zod.string(),
  webhook_secret: zod.string(),
})

export const BtcpayEdit = () => {
  const { t } = useTranslation()
  const { btcpay, isPending, isError, error } = useTenantBtcpay()
  const { mutateAsync } = useSaveTenantBtcpay()

  if (isError) {
    throw error
  }

  const settings = btcpay?.settings ?? null
  const schema = BtcpayBaseSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(btcpayDraftErrors(draft, settings))) {
      ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
    }
  })
  const keep = (masked: MaskedSecret | undefined) =>
    masked?.set
      ? t("paymentMethods.keepKey", { last4: masked.last4 ?? "" })
      : t("btcpay.emptyPlaceholder")

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.btcpay.drawerTitle")}
      description={t("btcpay.ownServerHint")}
      isPending={isPending}
      schema={schema}
      defaultValues={btcpayDraftFrom(settings)}
      onSubmit={(draft) => mutateAsync(btcpayPayload(draft))}
      successMessage={t("btcpay.saved")}
    >
      {(form) => (
        <>
          {btcpay?.unreadable ? <UnreadableSecretAlert testId="btcpay-unreadable" /> : null}
          <SwitchBox
            control={form.control}
            name="enabled"
            label={t("btcpay.fields.is_enabled")}
            description={t("paymentMethods.enabledHint")}
          />
          <MethodTextField
            control={form.control}
            name="server_url"
            label={t("btcpay.fields.server_url")}
            placeholder={t("paymentMethods.btcpay.serverUrlPlaceholder")}
            mono
            testId="btcpay-server_url"
          />
          <MethodTextField
            control={form.control}
            name="store_id"
            label={t("paymentMethods.btcpay.storeId")}
            placeholder={t("paymentMethods.btcpay.storeIdPlaceholder")}
            mono
            testId="btcpay-store_id"
          />
          <MethodTextField
            control={form.control}
            name="api_key"
            label={t("paymentMethods.accessKey")}
            hint={t("btcpay.apiKeyHint")}
            placeholder={keep(settings?.api_key)}
            secret
            testId="btcpay-api_key"
          />
          <MethodTextField
            control={form.control}
            name="webhook_secret"
            label={t("btcpay.fields.webhook_secret")}
            placeholder={keep(settings?.webhook_secret)}
            secret
            testId="btcpay-webhook_secret"
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
