import { defineRouting } from "next-intl/routing"
import { locales, defaultLocale } from "./config"

/**
 * Every page lives under `/<locale>` (`app/[locale]`), and `middleware.ts`
 * redirects a path without one. `always` makes next-intl's `Link` and
 * `useRouter` write that prefix themselves, so an internal link never costs a
 * redirect hop, which Firefox also reported as «Failed to fetch RSC payload»
 * on every prefetch (46df A-10). The middleware still does the negotiation;
 * next-intl's own middleware is not used.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: {
    mode: "always",
  },
})
