import { describe, expect, it } from "vitest"

import { typo } from "./typo"

const show = (s: string) => s.replace(/\u00a0/g, "·").replace(/\u202f/g, "⁃")

describe("typo", () => {
  it("binds digit groups and the rouble sign with a narrow no-break space", () => {
    expect(show(typo("300 000 ₽"))).toBe("300⁃000⁃₽")
  })

  it("binds a spaced em dash to the word before it", () => {
    expect(show(typo("Магазин — ваш"))).toBe("Магазин·— ваш")
  })

  it("binds short words to the next one, two in a row included", () => {
    expect(show(typo("Приём оплаты: рубли и из-за рубежа"))).toBe(
      "Приём оплаты: рубли и·из-за·рубежа"
    )
    expect(show(typo("Всё из «Старта», плюс:"))).toBe("Всё из·«Старта», плюс:")
  })

  it("is empty for nothing", () => {
    expect(typo(undefined)).toBe("")
  })
})
