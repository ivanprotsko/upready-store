import { describe, expect, it } from "vitest"

import {
  customerAvatarUrl,
  customerInitials,
  signedInText,
  yandexAvatarUrl,
} from "@lib/util/customer-avatar"
import { withYandexAvatar } from "@lib/util/yandex-auth"

/**
 * t-2026-10-12-05, Ivan 12.10: item 6.2 («показывать аватар если я залогинен») and item 6.4
 * («Вы вошли как Firstname Lastname, адрес эл. почты: …», or «Вы вошли с адресом эл. почты: …»
 * when Yandex ID gives no name).
 */

describe("the avatar", () => {
  it("draws the Yandex ID picture kept on the customer, at 50 px retina", () => {
    expect(
      customerAvatarUrl({ metadata: { yandex_avatar_id: "1450263/AzolHjBZ8DPtRomN7CIsMTwxk-1" } })
    ).toBe("https://avatars.yandex.net/get-yapic/1450263/AzolHjBZ8DPtRomN7CIsMTwxk-1/islands-retina-50")
  })

  it("has no picture without an id, or with one that is not an avatar id", () => {
    expect(customerAvatarUrl({ metadata: {} })).toBeNull()
    expect(customerAvatarUrl({ metadata: { yandex_avatar_id: null } })).toBeNull()
    expect(customerAvatarUrl(null)).toBeNull()
    expect(yandexAvatarUrl("../../evil")).toBeNull()
    expect(yandexAvatarUrl("a/b?c=1")).toBeNull()
  })

  it("falls back to the initials, else the e-mail's first letter", () => {
    expect(customerInitials({ first_name: "иван", last_name: "Процко", email: "i@x.ru" })).toBe("ИП")
    expect(customerInitials({ first_name: "Оксана", last_name: "", email: "o@x.ru" })).toBe("О")
    expect(customerInitials({ first_name: "", last_name: "", email: "ivanprotska@yandex.com" })).toBe("I")
  })

  it("never takes a letter from Telegram's synthetic address", () => {
    expect(
      customerInitials({ email: "tg_42@telegram.local", metadata: { telegram_username: "oksana" } })
    ).toBe("O")
    expect(customerInitials({ email: "tg_42@telegram.local" })).toBe("?")
  })
})

describe("the sign-in step's sentence", () => {
  it("names the buyer and the address when the profile has a name", () => {
    expect(signedInText({ first_name: "Иван", last_name: "Процко", email: "ivan@example.com" })).toEqual({
      key: "signInDoneNamed",
      values: { name: "Иван Процко", email: "ivan@example.com" },
    })
    expect(signedInText({ first_name: "", last_name: "Процко", email: "ivan@example.com" })).toEqual({
      key: "signInDoneNamed",
      values: { name: "Процко", email: "ivan@example.com" },
    })
  })

  it("names the address alone when Yandex ID gave no name", () => {
    expect(signedInText({ first_name: "", last_name: " ", email: "ivanprotska@yandex.com" })).toEqual({
      key: "signInDoneEmail",
      values: { email: "ivanprotska@yandex.com" },
    })
  })

  it("names the Telegram handle for a buyer with no real address", () => {
    expect(
      signedInText({ email: "tg_42@telegram.local", metadata: { telegram_username: "oksana" } })
    ).toEqual({ key: "signInDoneHandle", values: { name: "@oksana" } })
  })
})

describe("keeping the Yandex ID picture on the customer", () => {
  it("writes the id next to the other keys, and nothing when it is already there", () => {
    expect(withYandexAvatar({ locale: "ru" }, "1450263/abc")).toEqual({
      locale: "ru",
      yandex_avatar_id: "1450263/abc",
    })
    expect(withYandexAvatar({ locale: "ru", yandex_avatar_id: "1450263/abc" }, "1450263/abc")).toBeNull()
    expect(withYandexAvatar(null, null)).toBeNull()
  })

  it("forgets a picture removed on Yandex", () => {
    expect(withYandexAvatar({ yandex_avatar_id: "1450263/abc" }, null)).toEqual({ yandex_avatar_id: null })
  })
})
