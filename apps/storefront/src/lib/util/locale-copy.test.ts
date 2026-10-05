import { describe, expect, it } from "vitest"

import { pickLocaleCopy } from "./locale-copy"

describe("pickLocaleCopy", () => {
  const i18n = { en: { title: "Liver cleanse" }, pt: { title: "Limpeza" } }

  it("answers the locale's own entry, then its language's", () => {
    expect(pickLocaleCopy(i18n, "en")).toEqual({ title: "Liver cleanse" })
    expect(pickLocaleCopy(i18n, "pt-BR")).toEqual({ title: "Limpeza" })
    expect(
      pickLocaleCopy({ ...i18n, "pt-BR": { title: "Limpeza BR" } }, "pt-BR")
    ).toEqual({ title: "Limpeza BR" })
  })

  it("answers null when there is nothing for this locale", () => {
    expect(pickLocaleCopy(i18n, "ru")).toBeNull()
    expect(pickLocaleCopy(i18n, "")).toBeNull()
    expect(pickLocaleCopy(i18n, undefined)).toBeNull()
  })

  it("reads JSON it cannot trust as no override", () => {
    expect(pickLocaleCopy(undefined, "en")).toBeNull()
    expect(pickLocaleCopy("en", "en")).toBeNull()
    expect(pickLocaleCopy([{ title: "x" }], "en")).toBeNull()
    expect(pickLocaleCopy({ en: "Liver cleanse" }, "en")).toBeNull()
    expect(pickLocaleCopy({ en: ["x"] }, "en")).toBeNull()
    expect(pickLocaleCopy({}, "constructor")).toBeNull()
  })
})
