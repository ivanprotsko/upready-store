import { getLocaleDir } from "@i18n/config"
import { GA_MEASUREMENT_ID, getBaseURL } from "@lib/util/env"
import GoogleAnalytics from "@modules/common/components/google-analytics"
import type { Metadata } from "next"
import { getLocale } from "next-intl/server"
import { fontClassName, readProfileTheme, themePrePaintScript } from "@lib/theme"
import DevtoolsMount from "@modules/devtools/components/devtools-mount"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getLocale()
  // theme + mode come from the active store profile; an absent or theme-less profile
  // falls back to "default"/"light", which themes.css resolves to the medusa preset —
  // today's look. See src/lib/theme/profile.ts.
  const { theme, mode } = readProfileTheme()

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
            devtools cookie; null for everybody else, including the HTML of a visitor. */}
        <DevtoolsMount />
      </body>
    </html>
  )
}
