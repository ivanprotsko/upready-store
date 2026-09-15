"use client"

import Script from "next/script"
import { useIdleAfterConsent } from "@modules/common/components/analytics-consent/use-idle-after-consent"
import SpaHits from "./spa-hits"

type YandexMetricaProps = {
  counterId: number
}

/**
 * Yandex Metrica (t17-analytics step 1/2): the vendor's own snippet, loaded
 * through `next/script` the way the rest of this storefront defers
 * non-critical scripts, plus the `noscript` pixel Metrica's own install
 * instructions ship — omitted, Metrica still counts a visit with JavaScript
 * enabled, but the pixel is what counts one without it.
 *
 * Gated on `useIdleAfterConsent`, the same load-deferral `GoogleAnalytics`
 * uses: nothing before consent, then idle or first interaction.
 */
const YandexMetrica = ({ counterId }: YandexMetricaProps) => {
  const shouldLoad = useIdleAfterConsent()

  if (!shouldLoad) {
    return null
  }

  return (
    <>
      <Script id="yandex-metrica" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

        ym(${counterId}, "init", {
             clickmap:true,
             trackLinks:true,
             accurateTrackBounce:true
        });`}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${counterId}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
      <SpaHits counterId={counterId} />
    </>
  )
}

export default YandexMetrica
