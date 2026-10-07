import { getLocaleDir } from "@i18n/config"
import { getRequestBaseURL } from "@lib/data/cookies"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { getTenantAnalytics } from "@lib/data/analytics"
import { getClientMessages } from "@lib/data/client-messages"
import Analytics from "@modules/common/components/analytics"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { getSiteTestMode } from "@lib/data/tenant-test-mode"
import { visibleTestMode } from "@lib/tenant/test-mode"
import { buildIconMetadata } from "@lib/tenant/icons"
import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { fontClassName, isAllowed, readProfileTheme, themePrePaintScript } from "@lib/theme"
// Branch-local (`redesign-olavka`): the Figma node's three typefaces, see the module.
import { olavkaFontClassName } from "@lib/theme/olavka-fonts"
import { OLAVKA_INTER_CSS, OLAVKA_INTER_PRELOAD } from "@lib/theme/olavka-inter"
import {
  getEffectiveSettings,
  getTenantModeDefault,
  getTenantThemePreset,
} from "@lib/data/tenant-home"
import StudioMount from "@modules/studio/components/studio-mount"
import MiniAppBridge from "@modules/telegram/components/mini-app-bridge"
import TestModeDot from "@modules/common/components/test-mode-dot"
import "styles/globals.css"

// Per request: the base a relative metadata URL (an Open Graph image) resolves
// against is the shop that was asked, not the one value baked into the image
// (`lib/tenant/origin.ts`).
//
// t16-owner-branding, step 3: the tenant's own favicon overrides the build's
// default (config-based `icons` wins over the static `icon.svg` file
// convention at the same segment — measured, not the case for og/twitter
// images below). The og/twitter image itself is NOT set here: a tenant's own
// image is served by `opengraph-image.tsx`/`twitter-image.tsx`, because the
// static `opengraph-image.png`/`twitter-image.png` file convention always
// wins over a same-named field set from `generateMetadata` — setting it here
// too would risk a duplicate `og:image` tag once both are present.
//
// t-2026-10-03-61: with an icon set (`branding.app_icons`, built by the
// backend from the favicon upload) the single favicon becomes one `<link>` per
// size and purpose, plus Safari's `mask-icon` and the Windows tile tags
// (`lib/tenant/icons.ts`). A tenant with no set keeps the icons it had.
// The PWA manifest is not linked here: the `app/manifest.ts` file convention
// links `/manifest.webmanifest` from every page itself.
export async function generateMetadata(): Promise<Metadata> {
  const [baseURL, branding] = await Promise.all([getRequestBaseURL(), getSiteBranding()])

  return { metadataBase: new URL(baseURL), ...buildIconMetadata(branding) }
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getLocale()
  // theme comes from the active store profile only — the composition never touches
  // the `data-theme` axis (critique §2.3). An absent or theme-less profile falls back
  // to "default", which themes.css resolves to the medusa preset — today's look. See
  // src/lib/theme/profile.ts.
  //
  // Tenant panel wave 2, piece 8: a tenant that saved a home-page document names its own
  // preset there, and that wins over the build profile — one backend serves many
  // storefronts, so the profile baked into this build is a fallback, not the tenant's
  // choice. Piece 9 made that read per REQUEST: one process serves every shop, and
  // `src/middleware.ts` resolves which one from the Host header, so
  // `getTenantThemePreset()`/`getTenantModeDefault()` answer from the `x-tenant-*` headers
  // it set and fall back to the document itself (`lib/data/tenant-home.ts`). A host with
  // no shop behind it gets null from both and lands on the build profile — today's
  // single-store behaviour, unchanged.
  //
  // Both values cross the wire as plain strings, so each goes through the theme axis'
  // own allow-list before it reaches the attribute: `data-theme="…"` is what selects the
  // CSS block in styles/themes.css, and a value that file cannot resolve would paint
  // nothing. `isAllowed` is the registry's own guard (`lib/theme/attributes.ts`), so it
  // accepts `default` as well as every generated preset.
  const { theme: profileTheme, mode: profileMode } = readProfileTheme()

  // Mode resolution order, highest priority first (panel-composition-mockup.md §C6):
  //   1. the visitor's own localStorage — applied by the pre-paint script below,
  //      AFTER this SSR value paints but BEFORE hydration, so it overwrites this
  //      attribute with no flash when present;
  //   2. the saved site-wide default (store.metadata.storefrontSettings.defaultMode);
  //   3. the profile's own built-in default (readProfileTheme(), unchanged).
  // A visitor who never touched the toggle sees step 2/3 with no overwrite (nothing in
  // storage disagrees); one who did gets it overwritten before paint.
  const [settings, tenantPreset, tenantMode, analytics, branding, olavka, testMode, messages] =
    await Promise.all([
      getEffectiveSettings(),
      getTenantThemePreset(),
      getTenantModeDefault(),
      getTenantAnalytics(),
      getSiteBranding(),
      isOlavkaShop(),
      getSiteTestMode(),
      getClientMessages(),
    ])
  // A Metrica id is validated server-side as 6-10 digits (`validators.ts`);
  // this parse only ever produces a clean integer or null, never NaN reaching
  // the component (t17-analytics step 1).
  const yandexCounterId = analytics.yandexMetricaId
    ? Number.parseInt(analytics.yandexMetricaId, 10)
    : null
  const theme = isAllowed("data-theme", tenantPreset) ? tenantPreset : profileTheme
  // The shop's own default sits ahead of the site-wide one: on a multi-shop process
  // `store.metadata.storefrontSettings` belongs to the whole backend and cannot speak
  // for one shop. `getEffectiveSettings()` already prefers the shop's document, so the
  // second term only ever answers for a single-store stand.
  const mode =
    (isAllowed("data-mode", tenantMode) ? tenantMode : null) ??
    settings?.defaultMode ??
    profileMode

  // t16-owner-branding, step 3/4: the owner's primary colour, applied as an
  // inline style so it outranks the `[data-theme][data-mode]` attribute
  // selectors in themes.css in both modes, the same tokens those presets
  // already write (`--primary`/`--primary-foreground`/`--ring`). The colour
  // itself is never altered — only the foreground text on top of it is
  // picked for contrast (`primary_foreground`, computed backend-side). No
  // `primary_color` means no style prop at all, so a shop that set nothing
  // renders byte-identical to today.
  const brandStyle = branding.primary_color
    ? ({
        "--primary": branding.primary_color,
        // theme-colours allowlist: the owner's brand pipeline; the backend computes the ink, this only covers its absence.
        "--primary-foreground": branding.primary_foreground ?? "#ffffff",
        "--ring": branding.primary_color,
      } as React.CSSProperties)
    : undefined

  return (
    <html
      lang={locale}
      dir={getLocaleDir(locale)}
      data-theme={theme}
      data-mode={mode}
      className={[fontClassName, olavkaFontClassName].filter(Boolean).join(" ") || undefined}
      style={brandStyle}
      // Marks an Olavka shop (`OLAVKA_SHOP_HANDLES`) for the styles a client component or a
      // portal cannot learn from the server: the product row tile's 1rem type (remark 17),
      // the search input's focus ring (remark 18).
      data-shop={olavka ? "olavka" : undefined}
    >
      <head>
        {/* Applies the visitor's stored choice before the first paint, so a reload
            does not flash the profile default. Allow-listed, idempotent, never throws. */}
        <script dangerouslySetInnerHTML={{ __html: themePrePaintScript() }} />
        {olavka
          ? OLAVKA_INTER_PRELOAD.map((href) => (
              <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="" />
            ))
          : null}
        {olavka ? <style dangerouslySetInnerHTML={{ __html: OLAVKA_INTER_CSS }} /> : null}
      </head>
      <body>
        {/* Not `<main>`: this wraps the header and the footer too, and a `<header>` inside
            `<main>` is not a `banner` landmark (nor a `<footer>` a `contentinfo`). Each
            route group marks its own main content: `(main)/layout.tsx`, `(checkout)/layout.tsx`,
            `start/layout.tsx` and the root `not-found.tsx`. */}
        <div className="relative">{props.children}</div>
        {/* t-2026-10-04-21 (checkout-v2 A3): red dot while payments or delivery are in test mode. */}
        {/* t-2026-10-08-13: `STOREFRONT_HIDE_TEST_MODE_DOT` takes the dot off for the time of
            the Robokassa moderation (`visibleTestMode`). */}
        <TestModeDot mode={visibleTestMode(testMode)} locale={locale} />
        {/* Telegram Mini App bridge: inert in a browser, active only when a Telegram
            client opened the page (src/modules/telegram/components/mini-app-bridge). */}
        <MiniAppBridge />
        {/* Renders the hidden settings panel only for a browser that carries the
            studio cookie; null for everybody else, including the HTML of a visitor.
            Wrapped in its own NextIntlClientProvider: this root layout sits OUTSIDE the
            [locale] layout that provides the intl context, and the panel is a client
            component calling useTranslations("Composition") — without the provider the
            popover threw on open (measured 2026-09-10 on every stand: "Application
            error: a client-side exception", next-intl rethrows as Error(undefined) in
            production). The provider inherits the locale from the request config.

            t-2026-10-08-13, part A6: `messages` is the same object `[locale]/layout.tsx`
            hands over (`getClientMessages`), the dictionary without the strings of what
            this shop has switched off. Without the prop the provider takes the whole
            catalogue, and the page code carries it whatever the other provider got.

            Analytics' own consent banner (`useTranslations("AnalyticsConsent")`)
            needs the same provider, so it is mounted here rather than as a
            second sibling provider (t17-analytics step 3). */}
        <NextIntlClientProvider messages={messages}>
          <Analytics
            ga4MeasurementId={analytics.ga4MeasurementId}
            yandexCounterId={yandexCounterId}
          />
          <StudioMount />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
