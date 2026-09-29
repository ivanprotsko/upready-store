import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { RobokassaCredentialsFields } from "../../payments/components/robokassa-credentials-fields"
import { useRobokassaForm } from "../../payments/use-robokassa-form"
import { CrossLink } from "../components/cross-link"
import { UnreadableSecretAlert } from "../components/unreadable-secret-alert"

/**
 * «Подключение → Robokassa» — the shop's payment REQUISITES and nothing else
 * (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «давай перенесем все подключения на страницу
 * /settings/integrations/[robokassa, wildberries, ozon, api, ship, cdek]». So
 * this page holds the MerchantLogin and the four passwords, saves them, deletes
 * them, and says where the test mode and the hash algorithm went.
 *
 * The form was MOVED, not copied: `useRobokassaForm` is the one draft and the
 * one submit, shared with «Приём оплат» (rule 20 — one form per service in the
 * tree).
 */
export const RobokassaIntegration = () => {
  const { t } = useTranslation()
  const form = useRobokassaForm()
  const {
    settings,
    unreadable,
    loaded,
    busy,
    isSaving,
    isRemoving,
    isError,
    error,
    handleSubmit,
    handleSubmitInTestMode,
    liveNeedsPasswords,
    handleRemove,
  } = form

  if (isError) {
    throw error
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("integrations.robokassa.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.robokassa.subtitle")}
            </Text>
          </div>
          {/* Three states, not two: while the record is in flight the badge is
              absent rather than saying «не подключено» (rule 19h). */}
          {unreadable ? (
            <Badge size="2xsmall" color="red" data-testid="robokassa-state">
              {t("integrations.state.unreadable")}
            </Badge>
          ) : settings ? (
            <Badge size="2xsmall" color="green" data-testid="robokassa-state">
              {t("integrations.state.connected", {
                last4: settings.password1.last4 ?? settings.test_password1.last4 ?? "",
              })}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="orange" data-testid="robokassa-state">
              {t("integrations.state.missing")}
            </Badge>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          {unreadable ? <UnreadableSecretAlert testId="robokassa-unreadable" /> : null}
          <RobokassaCredentialsFields form={form} />

          {liveNeedsPasswords ? (
            <Text
              size="small"
              className="text-ui-fg-subtle"
              data-testid="robokassa-live-needs-passwords"
            >
              {t("paymentSettings.liveNeedsPasswordsHint")}
            </Text>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy}
              data-testid="robokassa-save"
            >
              {t("paymentSettings.save")}
            </Button>
            {liveNeedsPasswords ? (
              <Button
                type="button"
                size="small"
                variant="secondary"
                disabled={busy}
                onClick={handleSubmitInTestMode}
                data-testid="robokassa-save-test-mode"
              >
                {t("paymentSettings.saveInTestMode")}
              </Button>
            ) : null}
            {settings || unreadable ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
                data-testid="robokassa-remove"
              >
                {t("paymentSettings.remove")}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="px-6 py-4">
          <CrossLink
            to="/settings/payments"
            hint={t("integrations.crossLink.behaviourHint")}
            label={t("paymentSettings.title")}
            testId="robokassa-behaviour-link"
          />
        </div>
      </Container>
    </SingleColumnPage>
  )
}
