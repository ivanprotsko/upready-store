import "server-only"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"
import { GA_MEASUREMENT_ID } from "@lib/util/env"

export type AnalyticsConfig = {
  yandexMetricaId: string | null
  ga4MeasurementId: string | null
}

/**
 * This request's analytics ids (t17-analytics step 1), carried by the
 * middleware on `x-tenant-analytics` the same way the search-console tags
 * travel (`lib/data/seo-verification.ts`).
 *
 * A resolved tenant (the header is present, even if both ids inside it are
 * null — see below) NEVER falls back to `NEXT_PUBLIC_GA_MEASUREMENT_ID`: that
 * variable is the single-store install's own fallback, one id for the whole
 * platform, and applying it to a tenant would count every shop with no
 * counter of its own under one owner's GA property. Only the absence of a
 * tenant at all (single-store mode, no `x-tenant-*` headers set) reads the
 * build-time id.
 *
 * The middleware only ever sets the header when at least one id is present
 * (`tenant.analytics` is null otherwise), so the header's mere presence
 * already means "this is a resolved, multi-tenant request."
 */
export const getTenantAnalytics = async (): Promise<AnalyticsConfig> => {
  try {
    const requestHeaders = await nextHeaders()
    const raw = decodeTenantHeaderValue(requestHeaders.get("x-tenant-analytics"))

    if (!raw) {
      // No tenant resolved this host (or it set neither counter): a resolved
      // tenant with a `x-tenant-handle` but no analytics header means it saved
      // no ids and gets no analytics at all (step 1); an UNRESOLVED host
      // (single-store mode) gets the build-time fallback.
      const handle = decodeTenantHeaderValue(requestHeaders.get("x-tenant-handle"))
      if (handle) {
        return { yandexMetricaId: null, ga4MeasurementId: null }
      }
      return { yandexMetricaId: null, ga4MeasurementId: GA_MEASUREMENT_ID ?? null }
    }

    const parsed = JSON.parse(raw) as Partial<{
      yandexMetricaId: string | null
      ga4MeasurementId: string | null
    }>

    return {
      yandexMetricaId: parsed.yandexMetricaId ?? null,
      ga4MeasurementId: parsed.ga4MeasurementId ?? null,
    }
  } catch {
    return { yandexMetricaId: null, ga4MeasurementId: null }
  }
}
