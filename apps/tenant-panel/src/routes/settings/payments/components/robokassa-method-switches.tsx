import { Label, Switch, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { RobokassaPanelMethod } from "../../../../hooks/api/payment-settings"
import type { RobokassaForm } from "../use-robokassa-form"

/** The aliases the panel names in its own words; Robokassa names SBP «Банковская карта». */
const KNOWN_ALIASES = ["BankCard", "SBP", "BankCardHalva", "Card120Days"]

const methodLabel = (
  t: (key: string) => string,
  method: RobokassaPanelMethod,
  language: string
): string => {
  if (KNOWN_ALIASES.includes(method.alias)) {
    return t(`paymentSettings.robokassaMethods.labels.${method.alias}`)
  }
  const named = language.startsWith("ru")
    ? method.name_ru ?? method.name_en
    : method.name_en ?? method.name_ru
  return named?.trim() || method.alias
}

/**
 * One switch per Robokassa method of the shop (t-2026-10-12-13, Ivan 12.10,
 * 4.1: «нужно выключить оплату СБП»). The list is the server's read of the
 * shop's Robokassa account, card and SBP included even while Robokassa does
 * not answer; a method switched off here reaches neither the checkout's rows
 * nor Robokassa's own window. The switches only change the draft: the form's
 * one «Сохранить» stores them with the rest of the account. The last method
 * still on cannot be switched off, a shop with Robokassa and no way to pay
 * through it would be a checkout that cannot be finished.
 */
export const RobokassaMethodSwitches = ({ form }: { form: RobokassaForm }) => {
  const { t, i18n } = useTranslation()
  const { draft, update, busy, robokassaMethods } = form
  const disabled = new Set(draft.disabled_methods)
  const onCount = robokassaMethods.filter((method) => !disabled.has(method.alias)).length

  const toggle = (alias: string, on: boolean) => {
    const next = new Set(disabled)
    if (on) {
      next.delete(alias)
    } else {
      next.add(alias)
    }
    update("disabled_methods", [...next])
  }

  return (
    <div className="flex flex-col gap-y-3 border-t pt-4" data-testid="robokassa-method-switches">
      <Text size="small" weight="plus">
        {t("paymentSettings.robokassaMethods.title")}
      </Text>
      {robokassaMethods.length ? (
        <ul className="flex flex-col gap-y-3">
          {robokassaMethods.map((method) => {
            const on = !disabled.has(method.alias)
            const id = `robokassa-method-${method.alias}`
            return (
              <li key={method.alias} className="flex items-center gap-x-3">
                <Switch
                  id={id}
                  checked={on}
                  disabled={busy || (on && onCount <= 1)}
                  onCheckedChange={(checked) => toggle(method.alias, checked)}
                  data-testid={id}
                />
                <Label htmlFor={id}>{methodLabel(t, method, i18n.language)}</Label>
              </li>
            )
          })}
        </ul>
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          {t("paymentSettings.robokassaMethods.none")}
        </Text>
      )}
      <Text size="small" className="text-ui-fg-subtle">
        {onCount <= 1 && robokassaMethods.length > 1
          ? t("paymentSettings.robokassaMethods.lastOne")
          : t("paymentSettings.robokassaMethods.hint")}
      </Text>
    </div>
  )
}
