import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useTenantManualPayment, useUpdateTenantManualPayment } from "../../../../hooks/api/manual-payment"
import { offersNothing } from "../../../../lib/payment-requisites"

// t-2026-10-14-01 (panel redesign, G3, line us-8): the drawer of the
// transfer's switch, route `/settings/payments/manual/edit`, the way
// «Принимать оплату» of Robokassa and Tribute is edited. It sends `enabled`
// alone. Switching on with no requisite and no manager contact is refused by
// the backend; the owner reads why under the switch before any request.

export const ManualPaymentEdit = () => {
  const { t } = useTranslation()
  const { manualPayment, isPending, isError, error } = useTenantManualPayment()
  const { mutateAsync } = useUpdateTenantManualPayment()

  if (isError) {
    throw error
  }

  const schema = zod.object({ enabled: zod.boolean() }).superRefine((draft, ctx) => {
    if (manualPayment && offersNothing({ ...manualPayment, enabled: draft.enabled })) {
      ctx.addIssue({ code: "custom", path: ["enabled"], message: t("manualPayment.errors.nothingToOffer") })
    }
  })

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.ways.manual.title")}
      isPending={isPending}
      schema={schema}
      defaultValues={{ enabled: manualPayment?.enabled ?? false }}
      onSubmit={(draft) => mutateAsync({ enabled: draft.enabled })}
      successMessage={t("paymentMethods.manual.saved")}
    >
      {(form) => (
        <SwitchBox
          control={form.control}
          name="enabled"
          label={t("paymentMethods.manual.enabled")}
          description={t("paymentMethods.manual.enabledHint")}
        />
      )}
    </SettingsEditDrawer>
  )
}
