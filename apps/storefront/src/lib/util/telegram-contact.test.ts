import { describe, expect, it } from "vitest"
import {
  customerContactLabel,
  isSyntheticTelegramEmail,
  realEmailOrEmpty,
  syntheticTelegramEmail,
  telegramHandle,
} from "./telegram-contact"

describe("isSyntheticTelegramEmail", () => {
  it("recognises the synthetic address in any case", () => {
    expect(isSyntheticTelegramEmail(syntheticTelegramEmail(42))).toBe(true)
    expect(isSyntheticTelegramEmail("TG_42@Telegram.Local")).toBe(true)
  })

  it("leaves real and empty addresses alone", () => {
    expect(isSyntheticTelegramEmail("buyer@yandex.ru")).toBe(false)
    expect(isSyntheticTelegramEmail("telegram.local@mail.ru")).toBe(false)
    expect(isSyntheticTelegramEmail("")).toBe(false)
    expect(isSyntheticTelegramEmail(null)).toBe(false)
  })
})

describe("customerContactLabel", () => {
  it("shows a real email as is", () => {
    expect(customerContactLabel({ email: "buyer@yandex.ru" })).toBe("buyer@yandex.ru")
  })

  it("shows the @handle instead of the synthetic address", () => {
    expect(
      customerContactLabel({
        email: "tg_42@telegram.local",
        first_name: "Иван",
        metadata: { telegram_username: "ivan" },
      })
    ).toBe("@ivan")
  })

  it("falls back to the name, then to Telegram", () => {
    expect(
      customerContactLabel({ email: "tg_42@telegram.local", first_name: "Иван", last_name: "П." })
    ).toBe("Иван П.")
    expect(customerContactLabel({ email: "tg_42@telegram.local" })).toBe("Telegram")
  })
})

describe("telegramHandle / realEmailOrEmpty", () => {
  it("returns null with nothing to go on", () => {
    expect(telegramHandle(null)).toBeNull()
    expect(telegramHandle({ metadata: { telegram_username: " " } })).toBeNull()
  })

  it("never prefills a form with the synthetic address", () => {
    expect(realEmailOrEmpty("tg_42@telegram.local")).toBe("")
    expect(realEmailOrEmpty("buyer@yandex.ru")).toBe("buyer@yandex.ru")
    expect(realEmailOrEmpty(undefined)).toBe("")
  })
})
