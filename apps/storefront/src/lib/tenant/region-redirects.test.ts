import { describe, expect, it } from "vitest"

import {
  isBotUserAgent,
  parseRegionRedirectsHeader,
  popupCountriesOf,
  regionChoiceCookie,
  shouldAskRegion,
} from "./region-redirects"

const RU = [{ country: "ru", url: "https://cherkashino.ru/" }]
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"

describe("parseRegionRedirectsHeader", () => {
  it("reads the middleware's list and drops anything else", () => {
    expect(
      parseRegionRedirectsHeader(
        '[{"country":"ru","url":"https://cherkashino.ru/"}]'
      )
    ).toEqual(RU)
    expect(
      parseRegionRedirectsHeader(
        '[{"country":"ru","url":"javascript:alert(1)"}]'
      )
    ).toEqual([])
    expect(
      parseRegionRedirectsHeader(
        '[{"country":"RUS","url":"https://cherkashino.ru/"}]'
      )
    ).toEqual([])
    expect(parseRegionRedirectsHeader("not json")).toEqual([])
    expect(parseRegionRedirectsHeader(null)).toEqual([])
  })
})

describe("shouldAskRegion", () => {
  it("asks a person on a shop with the setting who has not answered", () => {
    expect(
      shouldAskRegion({ redirects: RU, choice: null, userAgent: CHROME })
    ).toBe(true)
    expect(
      shouldAskRegion({ redirects: RU, choice: undefined, userAgent: IPHONE })
    ).toBe(true)
  })

  it("never asks on a shop without the setting", () => {
    expect(
      shouldAskRegion({ redirects: [], choice: null, userAgent: CHROME })
    ).toBe(false)
  })

  it("does not ask again once the cookie holds an answer", () => {
    expect(
      shouldAskRegion({ redirects: RU, choice: "kz", userAgent: CHROME })
    ).toBe(false)
    expect(
      shouldAskRegion({ redirects: RU, choice: "other", userAgent: CHROME })
    ).toBe(false)
    expect(
      shouldAskRegion({ redirects: RU, choice: "dismissed", userAgent: CHROME })
    ).toBe(false)
  })

  it("never asks a robot or a link preview", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "TelegramBot (like TwitterBot)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Discordbot/2.0",
      "",
      null,
    ]) {
      expect(
        shouldAskRegion({ redirects: RU, choice: null, userAgent: ua })
      ).toBe(false)
    }
  })

  it("reads browsers as people, the Yandex browser and a Cubot phone included", () => {
    expect(isBotUserAgent(CHROME)).toBe(false)
    expect(isBotUserAgent(IPHONE)).toBe(false)
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36"
      )
    ).toBe(false)
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Linux; Android 13; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"
      )
    ).toBe(false)
  })
})

describe("popupCountriesOf", () => {
  it("lists a small shop's countries after Kazakhstan, without Russia", () => {
    expect(popupCountriesOf(["us", "kz", "RU", "kz"], RU)).toEqual(["kz", "us"])
    expect(popupCountriesOf(["ru", "us"], RU)).toEqual(["kz", "us"])
    // Exactly the limit: six countries besides Kazakhstan and Russia are still listed.
    expect(popupCountriesOf(["am", "by", "de", "fr", "gb", "kz", "ru", "us"], RU)).toEqual(["kz", "am", "by", "de", "fr", "gb", "us"])
  })

  it("keeps only Kazakhstan for a shop on the whole world's regions", () => {
    expect(popupCountriesOf(["am", "by", "de", "fr", "gb", "it", "kz", "ru", "us"], RU)).toEqual(["kz"])
    expect(popupCountriesOf(["am", "by", "de", "fr", "gb", "it", "us"], RU)).toEqual(["kz"])
  })
})

describe("regionChoiceCookie", () => {
  it("remembers an answer for a year and a dismissal for the session", () => {
    expect(regionChoiceCookie("kz", true)).toBe(
      "_region_choice=kz; Path=/; SameSite=Lax; Max-Age=31536000; Secure"
    )
    expect(regionChoiceCookie("dismissed", false)).toBe(
      "_region_choice=dismissed; Path=/; SameSite=Lax"
    )
  })
})
