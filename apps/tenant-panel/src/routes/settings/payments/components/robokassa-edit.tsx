import { useTranslation } from "react-i18next"

import { SettingsEditDrawer } from "../../../../components/settings"
import { usePaymentSettings, useUpdatePaymentSettings } from "../../../../hooks/api/payment-settings"
import { modeNeedsPasswordsText, robokassaSaveErrorText } from "../mode-needs-passwords-key"
import { EMPTY_DRAFT, missingPasswordsFor } from "../use-robokassa-form"
import {
  RobokassaBehaviourFields,
  RobokassaBehaviourSchema,
  type RobokassaBehaviourValues,
} from "./robokassa-behaviour-fields"

// t-2026-10-14-01 (panel redesign, G3, prototype states
// `payments-robokassa-edit` and `payments-robokassa-saved`): the drawer of
// the Robokassa behaviour, route `/settings/payments/robokassa/edit`. It
// sends the same complete record the old «Приём оплат» form sent:
// `PUT /tenants/payment-settings` takes `merchant_login` on every request and
// treats each other field as «this or the stored one», so the body is the
// stored account with the drawer's fields replaced and no password in it.
// The refusal an owner meets in normal use («не хватает паролей») is checked
// here first and said in the owner's language; the toast is the one success word.

export const RobokassaEdit = () => {
  const { t } = useTranslation()
  const { settings, robokassa_methods: methods, isPending, isError, error } = usePaymentSettings()
  const { mutateAsync } = useUpdatePaymentSettings()

  if (isError) {
    throw error
  }

  const account = settings ?? null

  const save = async (values: RobokassaBehaviourValues) => {
    if (!account) {
      throw new Error(t("paymentMethods.robokassa.noAccountHint"))
    }
    const missing = missingPasswordsFor(values.is_test, EMPTY_DRAFT, account)
    if (values.is_enabled && missing.length) {
      throw new Error(modeNeedsPasswordsText(t, values.is_test, missing, false))
    }
    try {
      await mutateAsync({ provider: "robokassa", merchant_login: account.merchant_login, ...values })
    } catch (saveError) {
      throw new Error(robokassaSaveErrorText(t, (saveError as Error).message, false))
    }
  }

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.robokassa.behaviour.drawerTitle")}
      isPending={isPending}
      schema={RobokassaBehaviourSchema}
      defaultValues={{
        is_enabled: account?.is_enabled ?? true,
        is_test: account?.is_test ?? true,
        disabled_methods: account?.disabled_methods ?? [],
        fiscalization_enabled: account?.fiscalization_enabled ?? false,
        sno: account?.sno ?? "osn",
        default_tax: account?.default_tax ?? "none",
        hash_algorithm: account?.hash_algorithm ?? "sha256",
      }}
      onSubmit={save}
      successMessage={t("paymentSettings.saved")}
    >
      {(form) => <RobokassaBehaviourFields form={form} methods={methods ?? []} />}
    </SettingsEditDrawer>
  )
}
