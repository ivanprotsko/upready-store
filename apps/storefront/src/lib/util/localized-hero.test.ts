import { describe, expect, it } from "vitest"

import { localizedHero } from "./localized-hero"

const base = {
  title: "Acme",
  subtitle: "Acme runs on the shared engine and answers on its own domain.",
  cta_label: "Shop",
  cta_href: "/store",
  image_url: null,
}

describe("localizedHero", () => {
  it("overlays the locale's copy and keeps every field it does not name", () => {
    const hero = {
      ...base,
      i18n: { ru: { subtitle: "Acme работает на общем движке.", cta_label: "В каталог" } },
    }
    expect(localizedHero(hero, "ru")).toEqual({
      ...hero,
      subtitle: "Acme работает на общем движке.",
      cta_label: "В каталог",
    })
  })

  it("falls through to the base copy for a locale without an override and for an old document", () => {
    expect(localizedHero({ ...base, i18n: { ru: { subtitle: "x" } } }, "en")).toMatchObject(base)
    expect(localizedHero(base, "ru")).toBe(base)
  })

  it("lets a regional locale borrow its language's copy", () => {
    const hero = { ...base, i18n: { pt: { subtitle: "Loja nova." } } }
    expect(localizedHero(hero, "pt-BR")?.subtitle).toBe("Loja nova.")
  })

  it("answers undefined for no hero at all", () => {
    expect(localizedHero(undefined, "ru")).toBeUndefined()
    expect(localizedHero(null, "ru")).toBeUndefined()
  })
})
