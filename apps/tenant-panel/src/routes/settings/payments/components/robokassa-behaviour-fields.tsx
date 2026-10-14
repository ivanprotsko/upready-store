import { Select } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SwitchBox } from "../../../../components/common/switch-box"
import {
  ROBOKASSA_SNO_VALUES,
  ROBOKASSA_TAX_VALUES,
  type RobokassaPanelMethod,
} from "../../../../hooks/api/payment-settings"
import { RobokassaMethodSwitches } from "./robokassa-method-switches"

/**
 * How the shop BEHAVES on Robokassa (p01-settings-integrations-restructure):
 * whether the method is offered, test or live payments, which of Robokassa's
 * own methods the buyer sees, the 54-FZ receipt, which hash the signature
 * uses. The MerchantLogin and the passwords live on
 * `/settings/integrations/robokassa`.
 *
 * t-2026-10-14-01 (panel redesign, G3, prototype state
 * `payments-robokassa-edit`): the fields of the behaviour drawer, in the
 * prototype's order — «Принимать оплату» first, «Алгоритм подписи» last
 * (audit A4).
 */

export const ROBOKASSA_HASH_ALGORITHMS = ["sha256", "md5", "sha384", "sha512"] as const

export const RobokassaBehaviourSchema = zod.object({
  is_enabled: zod.boolean(),
  is_test: zod.boolean(),
  disabled_methods: zod.array(zod.string()),
  fiscalization_enabled: zod.boolean(),
  sno: zod.enum(ROBOKASSA_SNO_VALUES),
  default_tax: zod.enum(ROBOKASSA_TAX_VALUES),
  hash_algorithm: zod.enum(ROBOKASSA_HASH_ALGORITHMS),
})

export type RobokassaBehaviourValues = zod.infer<typeof RobokassaBehaviourSchema>

export const RobokassaBehaviourFields = ({
  form,
  methods,
}: {
  form: UseFormReturn<RobokassaBehaviourValues>
  methods: RobokassaPanelMethod[]
}) => {
  const { t } = useTranslation()
  const fiscal = useWatch({ control: form.control, name: "fiscalization_enabled" })

  return (
    <>
      <SwitchBox
        control={form.control}
        name="is_enabled"
        label={t("paymentSettings.fields.is_enabled")}
        description={t("paymentMethods.robokassa.enabledHint")}
      />
      <SwitchBox
        control={form.control}
        name="is_test"
        label={t("paymentSettings.fields.is_test")}
        description={t("paymentMethods.robokassa.testHint")}
      />

      {/* t-2026-10-12-13 (Ivan 12.10, 4.1: «нужно выключить оплату СБП»). */}
      <RobokassaMethodSwitches form={form} methods={methods} />

      {/* t-cherk-30: the 54-FZ receipt (`Receipt`). Robokassa only prints one
          when the shop sends the item list, and it is mandatory in practice
          for an ИП. */}
      <div className="flex flex-col gap-y-4">
        <SwitchBox
          control={form.control}
          name="fiscalization_enabled"
          label={t("paymentMethods.robokassa.fiscal")}
          description={t("paymentMethods.robokassa.fiscalHint")}
        />
        {fiscal ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Field
              control={form.control}
              name="sno"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("paymentSettings.fields.sno")}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref} data-testid="robokassa-sno">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {ROBOKASSA_SNO_VALUES.map((option) => (
                          <Select.Item key={option} value={option}>
                            {t(`paymentSettings.sno.${option}`)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="default_tax"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("paymentSettings.fields.default_tax")}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref} data-testid="robokassa-default-tax">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {ROBOKASSA_TAX_VALUES.map((option) => (
                          <Select.Item key={option} value={option}>
                            {t(`paymentSettings.tax.${option}`)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        ) : null}
      </div>

      <Form.Field
        control={form.control}
        name="hash_algorithm"
        render={({ field: { value, onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("paymentSettings.fields.hash_algorithm")}</Form.Label>
            <Form.Control>
              <Select {...field} value={value} onValueChange={onChange}>
                <Select.Trigger ref={ref} data-testid="robokassa-hash-algorithm">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {ROBOKASSA_HASH_ALGORITHMS.map((algorithm) => (
                    <Select.Item key={algorithm} value={algorithm}>
                      {algorithm.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            <Form.Hint>{t("paymentMethods.robokassa.hashHint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
    </>
  )
}
