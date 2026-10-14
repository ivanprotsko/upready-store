import { Checkbox, Label } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SwitchBox } from "../../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useSaveTenantX402, useTenantX402 } from "../../../../hooks/api/x402"
import { x402DraftErrors, x402DraftFrom, x402Payload } from "../../../../lib/x402-settings"
import { UnreadableSecretAlert } from "../../integrations/components/unreadable-secret-alert"
import { MethodTextField } from "./method-text-field"

// t-2026-10-14-01 (panel redesign, G3): the drawer of the x402 requisites,
// route `/settings/payments/x402/edit`. The fields, the checks
// (`x402DraftErrors`: an EVM address, one network at least to switch on, an
// https facilitator) and the body (`x402Payload`) are the old card's.

const X402BaseSchema = zod.object({
  enabled: zod.boolean(),
  pay_to: zod.string(),
  networks: zod.array(zod.string()),
  facilitator_url: zod.string(),
})

export const X402Edit = () => {
  const { t } = useTranslation()
  const { x402, isPending, isError, error } = useTenantX402()
  const { mutateAsync } = useSaveTenantX402()

  if (isError) {
    throw error
  }

  const schema = X402BaseSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(x402DraftErrors(draft))) {
      ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
    }
  })
  const offered = x402?.networks_offered ?? []

  return (
    <SettingsEditDrawer
      title={t("paymentMethods.x402.drawerTitle")}
      description={t("x402.intro")}
      isPending={isPending}
      schema={schema}
      defaultValues={x402DraftFrom(x402?.settings, x402?.default_facilitator_url ?? "")}
      onSubmit={(draft) => mutateAsync(x402Payload(draft))}
      successMessage={t("x402.saved")}
    >
      {(form) => (
        <>
          {x402?.unreadable ? <UnreadableSecretAlert testId="x402-unreadable" /> : null}
          <SwitchBox
            control={form.control}
            name="enabled"
            label={t("x402.fields.is_enabled")}
            description={t("paymentMethods.enabledHint")}
          />
          <MethodTextField
            control={form.control}
            name="pay_to"
            label={t("x402.fields.pay_to")}
            hint={t("x402.payToHint")}
            placeholder={t("paymentMethods.x402.payToPlaceholder")}
            mono
            testId="x402-pay_to"
          />
          <Form.Field
            control={form.control}
            name="networks"
            render={({ field: { value, onChange } }) => (
              <Form.Item>
                <Form.Label>{t("x402.fields.networks")}</Form.Label>
                <div className="flex flex-col gap-y-3">
                  {offered.map((network) => {
                    const id = `x402-network-${network.id}`
                    return (
                      <div key={network.id} className="flex items-center gap-x-3">
                        <Checkbox
                          id={id}
                          checked={value.includes(network.id)}
                          onCheckedChange={(checked) =>
                            onChange(
                              checked === true
                                ? [...value.filter((item) => item !== network.id), network.id]
                                : value.filter((item) => item !== network.id)
                            )
                          }
                          data-testid={id}
                        />
                        <Label htmlFor={id} size="small">
                          {network.testnet
                            ? t("paymentMethods.x402.testnetName", { name: network.label })
                            : network.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
                <Form.Hint>{t("x402.networksHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <MethodTextField
            control={form.control}
            name="facilitator_url"
            label={t("x402.fields.facilitator_url")}
            hint={t("x402.facilitatorHint")}
            placeholder={x402?.default_facilitator_url}
            mono
            testId="x402-facilitator_url"
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
