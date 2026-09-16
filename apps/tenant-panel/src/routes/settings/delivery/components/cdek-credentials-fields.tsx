import { Input, Label, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SecretStatus } from "../secret-status"
import { CDEK_SECRET_FIELDS, type CdekForm } from "../use-cdek-form"

/**
 * The CDEK ACCOUNT: the sandbox login and password, the live login and password
 * (p01-settings-integrations-restructure).
 *
 * This is the whole content of `/settings/integrations/cdek`. Both pairs stand
 * here together because CDEK issues them separately and the test switch — which
 * lives on «Доставка СДЭК» — decides which pair is in force; showing only the
 * active pair would make switching the mode a save that fails on a field the
 * owner cannot see.
 */
export const CdekCredentialsFields = ({ form }: { form: CdekForm }) => {
  const { t } = useTranslation()
  const { draft, update, busy, loaded, settings } = form

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="test_account">{t("deliverySettings.fields.test_account")}</Label>
          <Input
            id="test_account"
            autoComplete="off"
            value={draft.test_account}
            disabled={busy}
            onChange={(event) => update("test_account", event.target.value)}
            placeholder={loaded === null ? t("deliverySettings.loading") : ""}
            data-testid="cdek-test-account"
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="account">{t("deliverySettings.fields.account")}</Label>
          <Input
            id="account"
            autoComplete="off"
            value={draft.account}
            disabled={busy}
            onChange={(event) => update("account", event.target.value)}
            placeholder={loaded === null ? t("deliverySettings.loading") : ""}
            data-testid="cdek-account"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CDEK_SECRET_FIELDS.map((field) => (
          <div key={field} className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={field}>{t(`deliverySettings.fields.${field}`)}</Label>
              <SecretStatus masked={settings?.[field]} />
            </div>
            <Input
              id={field}
              type="password"
              autoComplete="new-password"
              value={draft[field]}
              disabled={busy}
              onChange={(event) => update(field, event.target.value)}
              placeholder={
                settings?.[field]?.set
                  ? t("deliverySettings.keepPlaceholder")
                  : t("deliverySettings.emptyPlaceholder")
              }
              data-testid={`cdek-${field}`}
            />
          </div>
        ))}
      </div>

      <Text size="small" className="text-ui-fg-subtle">
        {t("integrations.cdek.behaviourHint")}
      </Text>
    </>
  )
}
