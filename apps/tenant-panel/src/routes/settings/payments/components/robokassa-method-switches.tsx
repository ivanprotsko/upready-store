import { Label, Switch, Text } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../components/common/form"
import type { RobokassaPanelMethod } from "../../../../hooks/api/payment-settings"
import { robokassaMethodLabel } from "../payment-ways"
import type { RobokassaBehaviourValues } from "./robokassa-behaviour-fields"

/**
 * One switch per Robokassa method of the shop (t-2026-10-12-13, Ivan 12.10,
 * 4.1: «нужно выключить оплату СБП»). The list is the server's read of the
 * shop's Robokassa account, card and SBP included even while Robokassa does
 * not answer; a method switched off here reaches neither the checkout's rows
 * nor Robokassa's own window. The last method still on cannot be switched
 * off: a shop with Robokassa and no way to pay through it would be a checkout
 * that cannot be finished.
 *
 * t-2026-10-14-01 (panel redesign, G3): the switches live in the behaviour
 * drawer now and change its form's `disabled_methods`; the drawer's one
 * «Сохранить» stores them with the rest of the behaviour.
 */
export const RobokassaMethodSwitches = ({
  form,
  methods,
}: {
  form: UseFormReturn<RobokassaBehaviourValues>
  methods: RobokassaPanelMethod[]
}) => {
  const { t, i18n } = useTranslation()

  return (
    <Form.Field
      control={form.control}
      name="disabled_methods"
      render={({ field: { value, onChange } }) => {
        const off = new Set(value)
        const onCount = methods.filter((method) => !off.has(method.alias)).length

        const toggle = (alias: string, on: boolean) => {
          const next = new Set(off)
          if (on) {
            next.delete(alias)
          } else {
            next.add(alias)
          }
          onChange([...next])
        }

        return (
          <Form.Item>
            <Form.Label>{t("paymentMethods.robokassa.methods")}</Form.Label>
            <div
              className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-y-3 rounded-lg p-3"
              data-testid="robokassa-method-switches"
            >
              {methods.length ? (
                methods.map((method) => {
                  const on = !off.has(method.alias)
                  const id = `robokassa-method-${method.alias}`
                  return (
                    <div key={method.alias} className="flex items-center gap-x-3">
                      <Switch
                        id={id}
                        checked={on}
                        disabled={on && onCount <= 1}
                        onCheckedChange={(checked) => toggle(method.alias, checked)}
                        data-testid={id}
                      />
                      <Label htmlFor={id} size="small">
                        {robokassaMethodLabel(t, method, i18n.language)}
                      </Label>
                    </div>
                  )
                })
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  {t("paymentSettings.robokassaMethods.none")}
                </Text>
              )}
            </div>
            <Form.Hint>
              {onCount <= 1 && methods.length > 1
                ? t("paymentSettings.robokassaMethods.lastOne")
                : t("paymentMethods.robokassa.methodsHint")}
            </Form.Hint>
          </Form.Item>
        )
      }}
    />
  )
}
