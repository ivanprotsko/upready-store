import { describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-08-13, part A7: `/humans.txt`, `/index.php`, `/abc.html` and
 * `/favicon.png` of a live shop answered 200 with its home page. The
 * middleware passes a path with a dot as a file, no file is behind these, and
 * the path fell into `[locale]` with its own name in the place of the
 * language. The layout of that segment now refuses a value that is no
 * language.
 */

class NotFound extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound()
  },
}))

vi.mock("next-intl/server", () => ({ getLocale: async () => "ru" }))
vi.mock("@lib/data/cookies", () => ({
  getSiteName: async () => "Shop",
  getTenantHandle: async () => "acme",
}))
vi.mock("@lib/tenant/social-card", () => ({ buildSocialImageMetadata: () => ({}) }))
vi.mock("@lib/util/json-ld", () => ({ buildSiteJsonLd: async () => ({}) }))
vi.mock("@lib/cart-store", () => ({ CartQueueProvider: () => null }))
vi.mock("@modules/common/components/html-dir-sync", () => ({ default: () => null }))
vi.mock("@modules/common/components/json-ld", () => ({ default: () => null }))

const layout = async (locale: string) => {
  const { default: LocaleLayout } = await import("./layout")
  return LocaleLayout({ children: null, params: Promise.resolve({ locale }) })
}

describe("[locale] layout: the first part of the address has to be a language", () => {
  // `pt-BR` is a real language tag, and still not one of the 36 this build ships.
  it.each(["humans.txt", "index.php", "abc.html", "favicon.png", "feed.xml", "ads.txt", "xx", "pt-BR"])(
    "answers 404 for /%s",
    async (value) => {
      await expect(layout(value)).rejects.toBeInstanceOf(NotFound)
    }
  )

  it.each(["ru", "en", "zh"])("draws the page for /%s", async (value) => {
    await expect(layout(value)).resolves.toBeTruthy()
  })
})
