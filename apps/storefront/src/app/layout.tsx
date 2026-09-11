import { getLocaleDir } from "@i18n/config"
import { GA_MEASUREMENT_ID, getBaseURL } from "@lib/util/env"
import GoogleAnalytics from "@modules/common/components/google-analytics"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { fontClassName, isAllowed, readProfileTheme, themePrePaintScript } from "@lib/theme"
import { getStorefrontSettings } from "@lib/data/storefront-settings"
import { getTenantHome } from "@lib/data/tenant-home"
import DevtoolsMount from "@modules/devtools/components/devtools-mount"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getLocale()
  // theme comes from the active store profile only — the composition never touches
  // the `data-theme` axis (critique §2.3). An absent or theme-less profile falls back
  // to "default", which themes.css resolves to the medusa preset — today's look. See
  // src/lib/theme/profile.ts.
  const { theme: profileTheme, mode: profileMode } = readProfileTheme()

  // One process serves every shop (piece 9, docs/multitenancy/storefront-by-host.md
  // §2): `src/middleware.ts` resolved the shop from the Host header and put its
  // theme preset and default mode on the request headers. A host with no shop
  // behind it sends none and this falls straight back to the build profile —
  // today's single-store behaviour, unchanged.
  //
  // Both values go through the theme axis allow-list before they reach the
  // attribute: they arrive over the network, and `data-theme="…"` is what selects
  // the CSS block in styles/themes.css.
  const requestHeaders = await headers()
  const tenantTheme = requestHeaders.get("x-tenant-theme")
  const tenantMode = requestHeaders.get("x-tenant-mode")

  const theme =
    tenantTheme && isAllowed("data-theme", tenantTheme) ? tenantTheme : profileTheme

  // Mode resolution order, highest priority first (panel-composition-mockup.md §C6):
  //   1. the visitor's own localStorage — applied by the pre-paint script below,
  //      AFTER this SSR value paints but BEFORE hydration, so it overwrites this
  //      attribute with no flash when present;
  //   2. the saved site-wide default (store.metadata.storefrontSettings.defaultMode);
  //   3. the profile's own built-in default (readProfileTheme(), unchanged).
  // A visitor who never touched the toggle sees step 2/3 with no overwrite (nothing in
  // storage disagrees); one who did gets it overwritten before paint.
  // Mode, in the same order, with the shop's own default ahead of the site-wide
  // one: on a multi-shop process `store.metadata.storefrontSettings` belongs to
  // the whole backend and cannot speak for one shop.
  const [home, settings] = await Promise.all([
    getTenantHome(),
    getStorefrontSettings(),
  ])
  const tenantDefaultMode =
    (tenantMode && isAllowed("data-mode", tenantMode) ? tenantMode : null) ??
    home?.settings?.defaultMode ??
    null
  const mode = tenantDefaultMode ?? settings?.defaultMode ?? profileMode

  return (
    <html
      lang={locale}
      dir={getLocaleDir(locale)}
      data-theme={theme}
      data-mode={mode}
      className={fontClassName || undefined}
    >
      <head>
        {/* Applies the visitor's stored choice before the first paint, so a reload
            does not flash the profile default. Allow-listed, idempotent, never throws. */}
        <script dangerouslySetInnerHTML={{ __html: themePrePaintScript() }} />
      </head>
      <body>
        <main className="relative">{props.children}</main>
        {GA_MEASUREMENT_ID ? <GoogleAnalytics gaId={GA_MEASUREMENT_ID} /> : null}
        {/* Renders the hidden settings panel only for a browser that carries the
            devtools cookie; null for everybody else, including the HTML of a visitor.
            Wrapped in its own NextIntlClientProvider: this root layout sits OUTSIDE the
            [locale] layout that provides the intl context, and the panel is a client
            component calling useTranslations("Composition") — without the provider the
            popover threw on open (measured 2026-09-10 on every stand: "Application
            error: a client-side exception", next-intl rethrows as Error(undefined) in
            production). The provider without props inherits locale and messages from
            the request config. */}
        <NextIntlClientProvider>
          <DevtoolsMount />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
