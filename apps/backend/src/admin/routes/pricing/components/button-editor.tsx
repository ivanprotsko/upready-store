import { Input, Label, Text } from "@medusajs/ui"

import { describeHref, type ButtonAction, type PricingButton } from "../../../lib/platform-pricing-api"
import { SelectField, TextField } from "./fields"

const ACTION_OPTIONS: { value: ButtonAction["type"]; label: string }[] = [
  { value: "link", label: "Ссылка или якорь на странице" },
  { value: "onboarding_free", label: "Сразу онбординг, без оплаты" },
  { value: "pay_first", label: "Сначала оплата, потом онбординг" },
  { value: "card_trial", label: "Ввод карты и пробный период, потом онбординг" },
]

const DEFAULT_TRIAL_DAYS = 14

/** The action a type starts with when the editor switches to it. */
function actionOf(type: ButtonAction["type"], previous: ButtonAction): ButtonAction {
  switch (type) {
    case "link":
      return { type, href: previous.type === "link" ? previous.href : "#final" }
    case "onboarding_free":
    case "pay_first":
      return { type }
    case "card_trial":
      return { type, trial_days: previous.type === "card_trial" ? previous.trial_days : DEFAULT_TRIAL_DAYS }
  }
}

/**
 * A button of the pricing page: its text, its look and what it does (Ivan's
 * 4.1.1). `pay_first` and `card_trial` lead into the demo till today, and the
 * editor says so next to the choice.
 */
export function ButtonEditor({
  button,
  tierId,
  onChange,
  testId,
}: {
  button: PricingButton
  /** The tariff the button carries into `/start`; null for a final button with none. */
  tierId: string | null
  onChange: (button: PricingButton) => void
  /** Prefix of the fields' test ids, e.g. `pricing-button-start`. */
  testId: string
}) {
  const { action } = button

  return (
    <div className="flex flex-col gap-y-3 rounded-md bg-ui-bg-subtle p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField
          label="Текст кнопки"
          value={button.label}
          onChange={(label) => onChange({ ...button, label })}
          testId={`${testId}-label`}
        />
        <SelectField
          label="Вид"
          value={button.style}
          options={[
            { value: "solid", label: "Тёмная" },
            { value: "outline", label: "Светлая" },
          ]}
          onChange={(style) => onChange({ ...button, style })}
        />
        <SelectField
          label="Действие"
          value={action.type}
          options={ACTION_OPTIONS}
          testId={`${testId}-action`}
          onChange={(type) => onChange({ ...button, action: actionOf(type, action) })}
        />
      </div>

      {action.type === "link" ? (
        <TextField
          label="Адрес"
          mono
          value={action.href}
          onChange={(href) => onChange({ ...button, action: { type: "link", href } })}
          hint="#якорь на этой странице (#final — финальный блок), /путь на сайте или https://…"
        />
      ) : null}

      {action.type === "card_trial" ? (
        <div className="flex flex-col gap-y-1 md:w-1/3">
          <Label size="small">Пробный период, дней</Label>
          <Input
            size="small"
            type="number"
            data-testid={`${testId}-trial`}
            min={1}
            max={365}
            value={Number.isFinite(action.trial_days) ? String(action.trial_days) : ""}
            onChange={(e) =>
              onChange({ ...button, action: { type: "card_trial", trial_days: Number.parseInt(e.target.value, 10) } })
            }
          />
        </div>
      ) : null}

      {action.type === "pay_first" || action.type === "card_trial" ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid="pricing-demo-till-note">
          Оплата не подключена — демо-касса: деньги не списываются, карта не привязывается. Настоящая
          оплата появится вместе с платёжным провайдером.
        </Text>
      ) : null}

      <Text size="xsmall" className="text-ui-fg-muted">
        Кнопка ведёт на: <span className="font-mono" data-testid={`${testId}-href`}>{describeHref(action, tierId)}</span>
      </Text>
    </div>
  )
}
