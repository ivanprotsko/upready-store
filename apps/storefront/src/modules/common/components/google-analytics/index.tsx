"use client"

import { GoogleAnalytics as GtagScripts } from "@next/third-parties/google"
import { useEffect } from "react"
import { useIdleAfterConsent } from "@modules/common/components/analytics-consent/use-idle-after-consent"
import SpaPageviews from "./spa-pageviews"

type GoogleAnalyticsProps = {
  gaId: string
}

const GoogleAnalytics = ({ gaId }: GoogleAnalyticsProps) => {
  // t17-analytics step 2/3: no counter before consent, and deferred to idle
  // (or the visitor's first interaction) once granted.
  const shouldLoad = useIdleAfterConsent()

  useEffect(() => {
    if (shouldLoad) {
      window.dataLayer = window.dataLayer || []
    }
  }, [shouldLoad])

  if (!shouldLoad) {
    return null
  }

  return (
    <>
      <GtagScripts gaId={gaId} />
      <SpaPageviews />
    </>
  )
}

export default GoogleAnalytics
