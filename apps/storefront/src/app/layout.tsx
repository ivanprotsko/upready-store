import { getLocaleDir } from "@i18n/config"
import { GA_MEASUREMENT_ID, getBaseURL } from "@lib/util/env"
import GoogleAnalytics from "@modules/common/components/google-analytics"
import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { fontClassName, readProfileTheme, themePrePaintScript } from "@lib/theme"
import { THEME_IDS } from "@lib/theme/presets.generated"
import { getEffectiveSettings, getTenantThemePreset } from "@lib/data/tenant-home"
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
  //
  // Tenant panel wave 2, piece 8: a tenant that saved a home-page document names its own
  // preset there, and that wins over the build profile — one backend serves many
  // storefronts, so the profile baked into this build is a fallback, not the tenant's
  // choice. The value crosses the wire as a plain string, so it reaches `data-theme` only
  // when it is one of the presets `scripts/build-themes.mjs` actually generated; anything
  // else falls back to the profile's own theme rather than a `data-theme` themes.css
  // cannot resolve. Piece 9 moves this read to the request headers the by-host middleware
  // sets, which is why it goes through `lib/data/tenant-home.ts` and not straight to the
  // document here.
  const { theme: profileTheme, mode: profileMode } = readProfileTheme()

  // Mode resolution order, highest priority first (panel-composition-mockup.md §C6):
  //   1. the visitor's own localStorage — applied by the pre-paint script below,
  //      AFTER this SSR value paints but BEFORE hydration, so it overwrites this
  //      attribute with no flash when present;
  //   2. the saved site-wide default (store.metadata.storefrontSettings.defaultMode);
  //   3. the profile's own built-in default (readProfileTheme(), unchanged).
  // A visitor who never touched the toggle sees step 2/3 with no overwrite (nothing in
  // storage disagrees); one who did gets it overwritten before paint.
  const [settings, tenantPreset] = await Promise.all([
    getEffectiveSettings(),
    getTenantThemePreset(),
  ])
  const mode = settings?.defaultMode ?? profileMode
  const theme =
    tenantPreset && (THEME_IDS as readonly string[]).includes(tenantPreset)
      ? tenantPreset
      : profileTheme

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
