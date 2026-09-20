import { Input, Label, Select, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SECRET_FIELDS, type RobokassaForm } from "../use-robokassa-form"
import { SecretStatus } from "./secret-status"

/**
 * The Robokassa REQUISITES: the shop's MerchantLogin and its four passwords
 * (p01-settings-integrations-restructure).
 *
 * This is the whole content of `/settings/integrations/robokassa`. The test
 * mode and the hash algorithm are NOT here — they are how the shop behaves, not
 * who it is, and they stayed on «Приём оплат» where the owner already looks for
 * them (Ivan, 2026-09-16 20:22 WITA).
 */
export const RobokassaCredentialsFields = ({ form }: { form: RobokassaForm }) => {
  const { t } = useTranslation()
  const { draft, update, busy, loaded, settings } = form

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="provider">{t("paymentSettings.fields.provider")}</Label>
          <Select value="robokassa" disabled>
            <Select.Trigger id="provider">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="robokassa">Robokassa</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="merchant_login">{t("paymentSettings.fields.merchant_login")}</Label>
          <Input
            id="merchant_login"
            name="merchant_login"
            autoComplete="off"
            data-testid="robokassa-merchant-login"
            value={draft.merchant_login}
            disabled={busy}
            onChange={(event) => update("merchant_login", event.target.value)}
            placeholder={loaded === null ? t("paymentSettings.loading") : "OLAVKA"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SECRET_FIELDS.map((field) => (
          <div key={field} className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={field}>{t(`paymentSettings.fields.${field}`)}</Label>
              <SecretStatus masked={settings?.[field]} />
            </div>
            <Input
              id={field}
              name={field}
              type="password"
              autoComplete="new-password"
              data-testid={`robokassa-${field}`}
              value={draft[field]}
              disabled={busy}
              onChange={(event) => update(field, event.target.value)}
              placeholder={
                settings?.[field]?.set
                  ? t("paymentSettings.keepPlaceholder")
                  : t("paymentSettings.emptyPlaceholder")
              }
            />
          </div>
        ))}
      </div>

      <Text size="small" className="text-ui-fg-subtle">
        {t("integrations.robokassa.behaviourHint")}
      </Text>
    </>
  )
}
