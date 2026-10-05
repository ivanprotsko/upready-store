import { describe, expect, it } from "vitest"

import type { TenantHomeBanner } from "@lib/data/tenant-home"

import { localizedBanner } from "./localized-banner"

// cherkashino.com, 2026-10-05: the shop's default is English, so the base texts are
// English and the Russian ones sit in `i18n.ru` (N11).
const base: TenantHomeBanner = {
  id: "chistka-pecheni",
  image: {
    src: "https://example.com/chistka-pecheni-1920.webp",
    alt: "Liver cleanse: a liver among medicinal herbs",
  },
  kicker: "October 10",
  label: "Course",
  title: "Liver\ncleanse",
  button: "View",
  link: { type: "url", href: "/products/course-ochishchenie-pecheni-cherkashino" },
  sort: 0,
}

const russian = {
  kicker: "10 октября",
  label: "Курс",
  title: "Чистка\nпечени",
  button: "Смотреть",
  alt: "Чистка печени: печень среди лечебных трав",
}

describe("localizedBanner", () => {
  it("shows the Russian texts and alt on a Russian page", () => {
    const banner = { ...base, i18n: { ru: russian } }
    const shown = localizedBanner(banner, "ru")
    expect(shown).toMatchObject({
      kicker: "10 октября",
      label: "Курс",
      title: "Чистка\nпечени",
      button: "Смотреть",
    })
    expect(shown.image).toEqual({ ...base.image, alt: russian.alt })
    expect(shown.link).toEqual(base.link)
  })

  it("keeps the base texts on a page in the shop's default language", () => {
    const banner = { ...base, i18n: { ru: russian } }
    expect(localizedBanner(banner, "en")).toMatchObject({
      kicker: "October 10",
      title: "Liver\ncleanse",
      image: base.image,
    })
  })

  it("keeps the base for a locale with no entry and for a banner saved before i18n", () => {
    expect(localizedBanner({ ...base, i18n: { ru: russian } }, "de")).toMatchObject(base)
    expect(localizedBanner(base, "ru")).toBe(base)
  })

  it("fills a corner the translation leaves out or empty from the base", () => {
    const banner = { ...base, i18n: { ru: { title: "Чистка\nпечени", button: " " } } }
    expect(localizedBanner(banner, "ru")).toMatchObject({
      kicker: "October 10",
      label: "Course",
      title: "Чистка\nпечени",
      button: "View",
      image: base.image,
    })
  })

  it("lets a regional locale borrow its language's entry", () => {
    const banner = { ...base, i18n: { pt: { title: "Limpeza do fígado" } } }
    expect(localizedBanner(banner, "pt-BR").title).toBe("Limpeza do fígado")
  })
})
