import { getLocaleDir } from "@i18n/config"
import { GA_MEASUREMENT_ID } from "@lib/util/env"
import { getRequestBaseURL } from "@lib/data/cookies"
import GoogleAnalytics from "@modules/common/components/google-analytics"
import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { fontClassName, isAllowed, readProfileTheme, themePrePaintScript } from "@lib/theme"
import { getTenantThemePreset, resolveRequestMode } from "@lib/data/tenant-home"
import StudioMount from "@modules/studio/components/studio-mount"
import "styles/globals.css"

// Per request: the base a relative metadata URL (an Open Graph image) resolves
// against is the shop that was asked, not the one value baked into the image
// (`lib/tenant/origin.ts`).
export async function generateMetadata(): Promise<Metadata> {
  return { metadataBase: new URL(await getRequestBaseURL()) }
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
  const { theme: profileTheme } = readProfileTheme()

  // Mode resolution order, highest priority first (panel-composition-mockup.md §C6):
  //   1. the visitor's own localStorage — applied by the pre-paint script below,
  //      AFTER this SSR value paints but BEFORE hydration, so it overwrites this
  //      attribute with no flash when present;
  //   2. the saved site-wide default (store.metadata.storefrontSettings.defaultMode);
  //   3. the profile's own built-in default (readProfileTheme(), unchanged).
  // A visitor who never touched the toggle sees step 2/3 with no overwrite (nothing in
  // storage disagrees); one who did gets it overwritten before paint.
  //
  // Steps 2 and 3 live in `resolveRequestMode()` (`lib/data/tenant-home.ts`), not here:
  // the home page needs the same answer to decide which layer of a paired image may carry
  // `priority` (`modules/common/components/mode-image`), and a second copy of the order
  // would drift invisibly. The shop's own default sits ahead of the site-wide one there,
  // because on a multi-shop process `store.metadata.storefrontSettings` belongs to the
  // whole backend and cannot speak for one shop.
  const [tenantPreset, mode] = await Promise.all([
    getTenantThemePreset(),
    resolveRequestMode(),
  ])
  const theme = isAllowed("data-theme", tenantPreset) ? tenantPreset : profileTheme

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
            studio cookie; null for everybody else, including the HTML of a visitor.
            Wrapped in its own NextIntlClientProvider: this root layout sits OUTSIDE the
            [locale] layout that provides the intl context, and the panel is a client
            component calling useTranslations("Composition") — without the provider the
            popover threw on open (measured 2026-09-10 on every stand: "Application
            error: a client-side exception", next-intl rethrows as Error(undefined) in
            production). The provider without props inherits locale and messages from
            the request config. */}
        <NextIntlClientProvider>
          <StudioMount />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
