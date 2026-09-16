import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { CrossLink } from "../integrations/components/cross-link"
import { RobokassaBehaviourFields } from "./components/robokassa-behaviour-fields"
import { useRobokassaForm } from "./use-robokassa-form"

// «Приём оплат» (t03-tenant-secrets-robokassa, restructured by
// p01-settings-integrations-restructure).
//
// WHAT THIS SCREEN IS NOW: how the shop behaves on Robokassa — test or live,
// which hash the signature uses, whether the method is offered — plus the
// Result URL the owner pastes into her Robokassa dashboard.
//
// WHAT LEFT: the MerchantLogin and the four passwords. Ivan's order of
// 2026-09-16 20:22 WITA puts every service's REQUISITES under «Подключение», so
// they live at `/settings/integrations/robokassa` and this page links there.
// The form itself did not fork: both screens drive `useRobokassaForm`, which
// submits the whole record either way, because `PUT /tenants/payment-settings`
// wants `merchant_login` on every request.
//
// Rule 19h still shapes the load, inside the hook: «not answered yet» is its
// own state, the controls render disabled rather than swapped out, and a late
// answer never overwrites what the owner has already typed.

export const PaymentSettings = () => {
  const { t } = useTranslation()
  const form = useRobokassaForm()
  const { settings, resultUrl, loaded, busy, isSaving, isError, error, handleSubmit } = form

  if (isError) {
    throw error
  }

  // A shop with no Robokassa row has nothing to behave WITH: the endpoint takes
  // `merchant_login` as required, so saving from here would fail on a field
  // this screen no longer shows. Say where it is instead of offering a button
  // that cannot work (rule 19h — the real control, disabled, plus the reason).
  const noAccount = loaded !== null && !settings

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("paymentSettings.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("paymentSettings.subtitle")}
            </Text>
          </div>
          {settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"}>
              {settings.is_enabled
                ? settings.is_test
                  ? t("paymentSettings.stateTest")
                  : t("paymentSettings.stateLive")
                : t("paymentSettings.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey">
              {t("paymentSettings.stateNone")}
            </Badge>
          ) : null}
        </div>

        <div className="px-6 py-4">
          <CrossLink
            to="/settings/integrations/robokassa"
            hint={t("integrations.crossLink.credentialsHint")}
            label={t("integrations.robokassa.title")}
            testId="payments-credentials-link"
          />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          {noAccount ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="payments-no-account">
              {t("integrations.robokassa.noAccount")}
            </Text>
          ) : null}

          <RobokassaBehaviourFields form={form} />

          <div className="flex items-center gap-x-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy || noAccount}
              data-testid="payments-save"
            >
              {t("paymentSettings.save")}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            {t("paymentSettings.resultUrlTitle")}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {t("paymentSettings.resultUrlHint")}
          </Text>
          <code
            className="txt-compact-small rounded-md border bg-ui-bg-subtle px-2 py-1"
            data-testid="robokassa-result-url"
          >
            {resultUrl ?? t("paymentSettings.loading")}
          </code>
        </div>
      </Container>
    </SingleColumnPage>
  )
}
