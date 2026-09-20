import { useEffect, useRef, useState } from "react"
import { Button, Container, Heading, Hint, Input, Label, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import {
  useTenantAnalytics,
  useUpdateTenantAnalytics,
} from "../../../hooks/api/analytics-settings"

// t17-analytics step 1: the shop's own Yandex Metrica / GA4 ids. Same
// rule-19h shape as ../notifications/notifications.tsx: real, disabled
// controls while the record loads, and `touchedRef` so a slow answer never
// overwrites what the owner already typed.

type Draft = { yandex_metrica_id: string; ga4_measurement_id: string }

const EMPTY_DRAFT: Draft = { yandex_metrica_id: "", ga4_measurement_id: "" }

export const AnalyticsSettings = () => {
  const { t } = useTranslation()
  const { analytics, isPending, isError, error } = useTenantAnalytics()

  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending) {
      return
    }
    setLoaded(true)
    if (!touchedRef.current) {
      setDraft({
        yandex_metrica_id: analytics?.yandex_metrica_id ?? "",
        ga4_measurement_id: analytics?.ga4_measurement_id ?? "",
      })
    }
  }, [isPending, analytics])

  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantAnalytics()

  if (isError) {
    throw error
  }

  const busy = loaded === null || isSaving

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touchedRef.current = true
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await save(
      {
        yandex_metrica_id: draft.yandex_metrica_id.trim(),
        ga4_measurement_id: draft.ga4_measurement_id.trim(),
      },
      {
        onSuccess: (response) => {
          touchedRef.current = false
          setDraft({
            yandex_metrica_id: response.analytics.yandex_metrica_id ?? "",
            ga4_measurement_id: response.analytics.ga4_measurement_id ?? "",
          })
          toast.success(t("analyticsSettings.saved"))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{t("analyticsSettings.title")}</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            {t("analyticsSettings.subtitle")}
          </Text>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="yandex_metrica_id">
                {t("analyticsSettings.yandexMetrica.label")}
              </Label>
              <Input
                id="yandex_metrica_id"
                name="yandex_metrica_id"
                autoComplete="off"
                inputMode="numeric"
                value={draft.yandex_metrica_id}
                disabled={busy}
                onChange={(event) => update("yandex_metrica_id", event.target.value)}
                placeholder={loaded === null ? t("analyticsSettings.loading") : "12345678"}
              />
              <Hint>{t("analyticsSettings.yandexMetrica.hint")}</Hint>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="ga4_measurement_id">
                {t("analyticsSettings.ga4.label")}
              </Label>
              <Input
                id="ga4_measurement_id"
                name="ga4_measurement_id"
                autoComplete="off"
                value={draft.ga4_measurement_id}
                disabled={busy}
                onChange={(event) => update("ga4_measurement_id", event.target.value.toUpperCase())}
                placeholder={loaded === null ? t("analyticsSettings.loading") : "G-XXXXXXXXXX"}
              />
              <Hint>{t("analyticsSettings.ga4.hint")}</Hint>
            </div>
          </div>

          <div>
            <Button type="submit" size="small" isLoading={isSaving} disabled={busy}>
              {t("analyticsSettings.save")}
            </Button>
          </div>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
