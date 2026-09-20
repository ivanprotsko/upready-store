"use client"

import AnalyticsConsentBanner from "@modules/common/components/analytics-consent"
import GoogleAnalytics from "@modules/common/components/google-analytics"
import YandexMetrica from "@modules/common/components/yandex-metrica"

export type AnalyticsProps = {
  ga4MeasurementId: string | null
  /** A validated Metrica counter is digits only; parsed here, once. */
  yandexCounterId: number | null
}

/**
 * Mounted once in the root layout in place of the old direct
 * `<GoogleAnalytics>` (t17-analytics). Renders whichever counters this
 * request's tenant configured — a tenant with neither loads no analytics
 * script at all (step 1) — and the consent banner, which decides whether
 * either counter's own load-deferral hook ever fires (step 3).
 */
const Analytics = ({ ga4MeasurementId, yandexCounterId }: AnalyticsProps) => {
  if (!ga4MeasurementId && !yandexCounterId) {
    return null
  }

  return (
    <>
      {ga4MeasurementId ? <GoogleAnalytics gaId={ga4MeasurementId} /> : null}
      {yandexCounterId ? <YandexMetrica counterId={yandexCounterId} /> : null}
      <AnalyticsConsentBanner />
    </>
  )
}

export default Analytics
