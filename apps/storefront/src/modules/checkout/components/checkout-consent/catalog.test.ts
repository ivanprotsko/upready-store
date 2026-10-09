import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-09-56. Ivan 09.10: «чтобы все уместилось максимум в 2 строки, и тем более без
 * дубликатов!» and «не надо писать этот текст» about the delivery price line. Checked in
 * all 36 catalogs, since each one renders the same block.
 */

const dir = join(__dirname, "../../../../../messages")
const catalogs = readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({ file, m: JSON.parse(readFileSync(join(dir, file), "utf8")) }))

describe("checkout catalogs", () => {
  it("are all 36 of them", () => {
    expect(catalogs).toHaveLength(36)
  })

  it.each(catalogs.map(({ file, m }) => [file, m]))(
    "%s: no price line waiting for the address, a «Далее», and an offer sentence naming the offer alone",
    (_file, m) => {
      expect(m.CheckoutPage.deliveryPriceAfterAddress).toBeUndefined()
      expect(typeof m.CheckoutPage.next).toBe("string")
      expect(m.CheckoutPage.legal).toMatch(/<terms>.+<\/terms>/)
      expect(m.CheckoutPage.legal).not.toMatch(/privacyPolicy|termsOfUse|returnPolicy/)
      expect(m.CheckoutPage.legal).toContain("{button}")
    }
  )

  it("ru: the marketing box is one short line, the offer and the receipt together fit one", () => {
    const ru = catalogs.find(({ file }) => file === "ru.json")!.m
    expect(ru.CheckoutConsent.marketing.length).toBeLessThanOrEqual(90)
    const line = `${ru.CheckoutPage.legal.replace("{button}", "Оплатить").replace(/<\/?terms>/g, "")} ${ru.CheckoutConsent.receipt}`
    expect(line.length).toBeLessThanOrEqual(120)
    expect(ru.CheckoutConsent.receipt).toContain("54-ФЗ")
  })
})
