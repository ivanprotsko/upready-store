import { useTranslation } from "react-i18next"

import { SettingsDetail } from "../../../components/settings"
import { useTenantAnalytics } from "../../../hooks/api/analytics-settings"

// t17-analytics step 1: the shop's own Yandex Metrica / GA4 ids.
//
// t-2026-10-14-01 (panel redesign, G1): the screen only reads; both ids are
// edited in `analytics-edit` («…» → «Изменить»). Its title is «Счётчики», the
// name of its tab — «Аналитика» is the Wildberries report. That is Fable's
// question 2 to Ivan, still open, so the word lives in one key,
// `analyticsSettings.title`, which the breadcrumb and the drawer read too.
export const AnalyticsSettings = () => {
  const { t } = useTranslation()
  const { analytics, isPending, isError, error } = useTenantAnalytics()

  if (isError) {
    throw error
  }

  const metrica = analytics?.yandex_metrica_id || null
  const ga4 = analytics?.ga4_measurement_id || null

  return (
    <SettingsDetail
      isPending={isPending}
      sections={[
        {
          id: "analytics",
          title: t("analyticsSettings.title"),
          description: t("analyticsSettings.subtitle"),
          rows: [
            {
              id: "yandex-metrica",
              label: t("analyticsSettings.yandexMetrica.title"),
              value: metrica,
              mono: true,
              hint: metrica
                ? t("analyticsSettings.yandexMetrica.readHint")
                : t("analyticsSettings.yandexMetrica.emptyHint"),
            },
            {
              id: "ga4",
              label: t("analyticsSettings.ga4.title"),
              value: ga4,
              mono: true,
              hint: ga4
                ? t("analyticsSettings.ga4.readHint")
                : t("analyticsSettings.ga4.emptyHint"),
            },
          ],
        },
      ]}
    />
  )
}
