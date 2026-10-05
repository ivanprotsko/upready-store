import type { TenantHomeBanner } from "@lib/data/tenant-home"

import { pickLocaleCopy } from "./locale-copy"

const BANNER_TEXTS = ["kicker", "label", "title", "button"] as const

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/**
 * A home banner in the visitor's language. The base texts are in the shop's
 * default language and `banner.i18n` holds the other ones, the same convention
 * as the hero's `content.hero.i18n` (`localizedHero`). Measured on
 * cherkashino.com/ru, 2026-10-05: the shop's default is English, so a Russian
 * page showed «OCTOBER 10 · COURSE · LIVER CLEANSE» over a Russian interface.
 *
 * Each text, the picture's `alt` included, is taken from the locale's entry
 * (or its language's: `pt-BR` → `pt`) when it is non-empty, and from the base
 * otherwise, so a partly translated banner never loses a corner.
 */
export function localizedBanner(
  banner: TenantHomeBanner,
  locale: string
): TenantHomeBanner {
  const copy = pickLocaleCopy(banner.i18n, locale)
  if (!copy) {
    return banner
  }

  const texts = Object.fromEntries(
    BANNER_TEXTS.map((key) => [
      key,
      nonEmpty(copy[key]) ? copy[key] : banner[key],
    ])
  ) as Pick<TenantHomeBanner, (typeof BANNER_TEXTS)[number]>

  return {
    ...banner,
    ...texts,
    image: {
      ...banner.image,
      alt: nonEmpty(copy.alt) ? copy.alt : banner.image.alt,
    },
  }
}
