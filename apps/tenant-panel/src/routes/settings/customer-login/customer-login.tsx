import { useEffect, useRef, useState } from "react"
import { Button, Container, Heading, Hint, RadioGroup, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  type BuyerLoginMethod,
  useTenantLoginSettings,
  useUpdateTenantLoginSettings,
} from "../../../hooks/api/login-settings"

/**
 * «Вход покупателей» (o25-login-methods): the shop chooses whether its
 * storefront buyers sign in with email and password, Yandex ID, or either —
 * next to the other storefront-facing settings, same rule-19h shape as
 * `../seo/seo.tsx`: the real control renders disabled while the record
 * loads, never a skeleton that swallows a click.
 *
 * The two Yandex-inclusive options are disabled, with an honest hint,
 * whenever this DEPLOYMENT has no Yandex ID keys at all
 * (`yandex_platform_available`, read from the backend, which is the only
 * place that actually knows `YANDEX_CLIENT_ID`). A shop cannot turn on a
 * sign-in method that cannot possibly work, and the radio's own semantics —
 * exactly one method always selected — is what keeps "zero methods" from
 * ever being representable here.
 */
export const CustomerLogin = () => {
  const { t } = useTranslation()
  const { login_settings: saved, isPending, isError, error } = useTenantLoginSettings()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [method, setMethod] = useState<BuyerLoginMethod>("both")
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current && saved) {
      setMethod(saved.method)
    }
  }, [isPending, saved])

  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantLoginSettings()

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving
  const yandexAvailable = saved?.yandex_platform_available ?? false

  const update = (value: string) => {
    touchedRef.current = true
    setMethod(value as BuyerLoginMethod)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    await save(
      { method },
      {
        onSuccess: (response) => {
          touchedRef.current = false
          setMethod(response.login_settings.method)
          toast.success(t("customerLogin.saved"))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{t("customerLogin.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("customerLogin.subtitle")}
          </Text>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5 px-6 py-6">
          <RadioGroup
            value={method}
            onValueChange={update}
            className="flex flex-col gap-y-3"
          >
            <RadioGroup.ChoiceBox
              value="email"
              disabled={busy}
              label={t("customerLogin.options.email.label")}
              description={t("customerLogin.options.email.description")}
            />
            <RadioGroup.ChoiceBox
              value="yandex"
              disabled={busy || !yandexAvailable}
              label={t("customerLogin.options.yandex.label")}
              description={t("customerLogin.options.yandex.description")}
            />
            <RadioGroup.ChoiceBox
              value="both"
              disabled={busy || !yandexAvailable}
              label={t("customerLogin.options.both.label")}
              description={t("customerLogin.options.both.description")}
            />
          </RadioGroup>

          {!yandexAvailable && loaded !== null && (
            <Hint variant="info">{t("customerLogin.yandexUnavailableHint")}</Hint>
          )}

          <div>
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("customerLogin.save")}
            </Button>
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
