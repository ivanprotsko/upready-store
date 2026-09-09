"use client"

import { ExclamationCircleSolid, XMark } from "@medusajs/icons"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { promoStrip, promoText } from "@lib/profile"

const PROMO_BANNER_COOKIE = "_promo_banner_dismissed"

/**
 * The promo strip, frames 10 and 11 of artifacts/docs/2026-09-07-profile-home-mockup.md.
 *
 * It is rendered by app/[locale]/(main)/layout.tsx above the nav, so it is site-wide rather
 * than a home-page block; the home page therefore does not render a second copy. The store
 * profile changes what it says, not where it lives:
 *
 *   home.promoStrip.enabled === false   -> no strip anywhere on the site
 *   i18n/<locale>.json home.promoStrip.text -> per-locale text
 *   no override for this locale         -> the English base text from the profile
 *   no profile promo strip at all       -> the starter copy from messages/*.json, i.e.
 *                                          exactly what the storefront shows today
 *
 * `suppressed` is the ONE other reason this renders nothing: `header === "h3"`'s own
 * service tier (`nav/variants/h3.tsx`) shows this same promo text a second time, so
 * `(main)/layout.tsx` passes `suppressed` whenever the site-wide composition document
 * selects that header — a decision about the header, kept out of this component,
 * which stays ignorant of `storefrontSettings` entirely.
 */
function PromoBanner(props: { dismissed: boolean; suppressed?: boolean }) {
  const t = useTranslations("PromoBanner")
  const locale = useLocale()
  const [isVisible, setIsVisible] = useState(!props.dismissed)

  const profileMessage = promoText(locale)
  // enabled === false is a decision by the profile; the strip is not rendered at all.
  if (promoStrip && !promoStrip.enabled) {
    return null
  }

  if (props.suppressed) {
    return null
  }

  if (!isVisible) {
    return null
  }

  const handleClose = () => {
    setIsVisible(false)
    document.cookie = `${PROMO_BANNER_COOKIE}=1; path=/; max-age=${
      60 * 60 * 24 * 365
    }`
  }

  return (
    <div
      className="relative text-ui-contrast-fg-primary bg-ui-contrast-bg-base text-sm"
      data-testid="promo-banner"
      data-promo-source={profileMessage ? "profile" : "messages"}
    >
      <div className="content-container relative flex items-center justify-between gap-4 small:py-4 py-2 text-center">
        <span className="invisible shrink-0" aria-hidden="true">
          <XMark />
        </span>

        <div className="flex flex-col small:flex-row justify-center small:gap-2 gap-1 items-center">
          <span
            className="flex items-start gap-1"
            data-testid="promo-banner-text"
          >
            <ExclamationCircleSolid
              className="inline shrink-0 mt-[2.5px]"
              color="#A1A1AA"
            />
            {profileMessage ?? t("message")}
          </span>

          {/* Starter attribution, kept only while the strip still shows the starter copy. */}
          {profileMessage ? null : (
            <a
              href="https://gorgojs.com"
              target="_blank"
              rel="noreferrer"
              className="bg-[linear-gradient(163deg,#deba92_20%,#9f724e_45%,#deba92_90%)] bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              {t("cta")} →
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label={t("close")}
          className="shrink-0 text-ui-contrast-fg-secondary hover:text-ui-contrast-fg-primary transition-colors"
        >
          <XMark />
        </button>
      </div>
    </div>
  )
}

export default PromoBanner
