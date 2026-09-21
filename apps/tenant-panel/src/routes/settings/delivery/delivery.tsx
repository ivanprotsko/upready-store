import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SecretValue, hideQuery } from "../../../components/common/secret-value"
import { SingleColumnPage } from "../../../components/layout/pages"
import { CrossLink } from "../integrations/components/cross-link"
import { CdekBehaviourFields } from "./components/cdek-behaviour-fields"
import { useCdekForm } from "./use-cdek-form"

// «Доставка СДЭК» (i02-apiship-cdek-shipping, restructured by
// p01-settings-integrations-restructure).
//
// WHAT THIS SCREEN IS NOW: how the shop ships — where the parcel starts, which
// delivery kinds the checkout offers, the markup, the free-shipping threshold,
// test or live — plus the options that exist right now and the status webhook.
//
// WHAT LEFT: the CDEK account itself (two logins, two passwords). Ivan's order
// of 2026-09-16 20:22 WITA puts every service's requisites under «Подключение»,
// so they live at `/settings/integrations/cdek` and this page links there. The
// form did not fork: `useCdekForm` is the one draft and the one submit, and it
// sends the COMPLETE record from either screen — `PUT /tenants/delivery-settings`
// re-provisions the shipping options on every call, so a half-payload would
// reset the markup to zero silently (rule 20a).

export const DeliverySettings = () => {
  const { t } = useTranslation()
  const form = useCdekForm()
  const { settings, methods, webhookUrl, loaded, busy, isSaving, isError, error, handleSubmit } =
    form

  if (isError) {
    throw error
  }

  // No account yet: the endpoint verifies credentials against CDEK before it
  // writes anything, so a save from this screen would fail on fields it no
  // longer shows. The button stays rendered and disabled with the reason beside
  // it (rule 19h), never swapped for a paragraph.
  const noAccount = loaded !== null && !settings

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("deliverySettings.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.subtitle")}
            </Text>
          </div>
          {settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"}>
              {settings.is_enabled
                ? settings.is_test
                  ? t("deliverySettings.stateTest")
                  : t("deliverySettings.stateLive")
                : t("deliverySettings.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey">
              {t("deliverySettings.stateNone")}
            </Badge>
          ) : null}
        </div>

        <div className="px-6 py-4">
          <CrossLink
            to="/settings/integrations/cdek"
            hint={t("integrations.crossLink.credentialsHint")}
            label={t("integrations.cdek.title")}
            testId="delivery-credentials-link"
          />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          {noAccount ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="delivery-no-account">
              {t("integrations.cdek.noAccount")}
            </Text>
          ) : null}

          <CdekBehaviourFields form={form} />

          <div className="flex items-center gap-x-3">
            <Button
              type="submit"
              isLoading={isSaving}
              disabled={busy || noAccount}
              data-testid="cdek-save"
            >
              {t("deliverySettings.save")}
            </Button>
          </div>
        </form>

        {(methods?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-y-2 px-6 py-6">
            <Heading level="h3">{t("deliverySettings.methodsTitle")}</Heading>
            <ul className="flex flex-col gap-y-1" data-testid="cdek-methods">
              {(methods ?? []).map((method) => (
                <li key={method.id} className="flex items-center gap-x-2">
                  <Badge size="2xsmall" color={method.enabled ? "green" : "grey"}>
                    {method.enabled
                      ? t("deliverySettings.methodOn")
                      : t("deliverySettings.methodOff")}
                  </Badge>
                  <Text size="small">{method.name}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}

        {webhookUrl && (
          <div className="flex flex-col gap-y-2 px-6 py-6">
            <Heading level="h3">{t("deliverySettings.webhookTitle")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.webhookHint")}
            </Text>
            <SecretValue
              value={webhookUrl}
              hidden={hideQuery(webhookUrl)}
              testId="delivery-webhook-address"
            />
            <Badge size="2xsmall" color={settings?.webhook_registered ? "green" : "grey"}>
              {settings?.webhook_registered
                ? t("deliverySettings.webhookRegistered")
                : t("deliverySettings.webhookNotRegistered")}
            </Badge>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  )
}
