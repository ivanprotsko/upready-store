import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../../components/layout/pages"
import { CdekCredentialsFields } from "../../delivery/components/cdek-credentials-fields"
import { useCdekForm } from "../../delivery/use-cdek-form"
import { CrossLink } from "../components/cross-link"

/**
 * «Подключение → СДЭК» — the shop's CDEK account and nothing else
 * (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «зачем-то robokassa, доставка, сдэк. apiship
 * находятся внутри "подключение" раздела "маркетплейсы". Это неправильно». They
 * were rows on the marketplaces hub; each is a page of its own now, and СДЭК is
 * this one.
 *
 * Saving here sends the whole delivery record, kinds and markup included,
 * because the endpoint re-provisions the shipping options on every call. The
 * hook is the one place that knows it (`useCdekForm`).
 */
export const CdekIntegration = () => {
  const { t } = useTranslation()
  const form = useCdekForm()
  const { settings, loaded, busy, isSaving, isRemoving, isError, error, handleSubmit, handleRemove } =
    form

  if (isError) {
    throw error
  }

  const stored = settings?.test_password?.set || settings?.password?.set

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("integrations.cdek.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("integrations.cdek.subtitle")}
            </Text>
          </div>
          {settings ? (
            <Badge size="2xsmall" color={stored ? "green" : "orange"} data-testid="cdek-state">
              {stored
                ? t("integrations.state.connected", {
                    last4:
                      (settings.is_test ? settings.test_password.last4 : settings.password.last4) ??
                      "",
                  })
                : t("integrations.state.missing")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="orange" data-testid="cdek-state">
              {t("integrations.state.missing")}
            </Badge>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          <CdekCredentialsFields form={form} />

          <div className="flex items-center gap-x-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy}
              data-testid="cdek-credentials-save"
            >
              {t("deliverySettings.save")}
            </Button>
            {settings ? (
              <Button
                type="button"
                size="small"
                variant="danger"
                isLoading={isRemoving}
                disabled={busy}
                onClick={handleRemove}
                data-testid="cdek-remove"
              >
                {t("deliverySettings.remove")}
              </Button>
            ) : null}
          </div>
        </form>

        <div className="px-6 py-4">
          <CrossLink
            to="/settings/delivery"
            hint={t("integrations.crossLink.behaviourHint")}
            label={t("deliverySettings.title")}
            testId="cdek-behaviour-link"
          />
        </div>
      </Container>
    </SingleColumnPage>
  )
}
