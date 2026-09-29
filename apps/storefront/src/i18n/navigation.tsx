import type { ComponentProps } from "react"
import NextLink from "next/link"
import { createNavigation } from "next-intl/navigation"
import { isAppLocale } from "./config"
import { routing } from "./routing"

const navigation = createNavigation(routing)

export const { redirect, usePathname, useRouter, getPathname } = navigation

/**
 * The locale an internal href already names in its first segment, else null:
 * `/ru/store` → `ru`, `/store` → null, `https://…` → null (46df A-10).
 */
export function localeOfHref(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/")) {
    return null
  }
  const first = href.slice(1).split(/[/?#]/)[0]
  return isAppLocale(first) ? first : null
}

/**
 * next-intl's `Link`, which writes the current locale in front of every
 * internal href (`localePrefix: "always"`, `routing.ts`), so a click lands on
 * the page itself rather than on the middleware's 302 to it (46df A-10).
 *
 * An href that already names a locale, such as a menu link an owner typed as
 * `/ru/store`, goes out as it is: next-intl would prefix it a second time.
 */
export function Link(props: ComponentProps<typeof navigation.Link>) {
  if (props.locale === undefined && localeOfHref(props.href)) {
    const { locale: _locale, ...rest } = props
    // next-intl types its anchor attributes against a newer DOM lib than
    // next/link does (`popover="hint"`); the props themselves are the same.
    return <NextLink {...(rest as ComponentProps<typeof NextLink>)} />
  }
  return <navigation.Link {...props} />
}
