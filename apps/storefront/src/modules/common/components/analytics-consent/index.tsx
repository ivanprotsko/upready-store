"use client"

import { Button, Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { writeConsent } from "./consent"
import { useAnalyticsConsent } from "./use-analytics-consent"

/**
 * The banner analytics has been missing since this storefront gained a GA4
 * option: consent state, not "the id is set", now gates whether either
 * counter mounts (t17-analytics step 3). Renders only while consent is
 * "unknown" — a visitor who already answered, in this tab or a previous one,
 * never sees it again.
 */
const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent()
  const t = useTranslations("AnalyticsConsent")

  if (consent !== "unknown") {
    return null
  }

  return (
    <div
      role="region"
      aria-label={t("message")}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-3 border-t border-ui-border-base bg-ui-bg-base p-4 shadow-elevation-flyout small:flex-row small:justify-between"
      data-testid="analytics-consent-banner"
    >
      <Text size="small" className="text-ui-fg-subtle">
        {t("message")}
      </Text>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          size="small"
          onClick={() => writeConsent("denied")}
          data-testid="analytics-consent-decline"
        >
          {t("decline")}
        </Button>
        <Button
          variant="primary"
          size="small"
          onClick={() => writeConsent("granted")}
          data-testid="analytics-consent-accept"
        >
          {t("accept")}
        </Button>
      </div>
    </div>
  )
}

export default AnalyticsConsentBanner
