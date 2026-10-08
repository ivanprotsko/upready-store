import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isTribute,
  openTributePayment,
  telegramLinkOpener,
  tributePaymentTarget,
  tributeReturnUrl,
  tributeSessionData,
  tributeSessionOf,
} from "./tribute"

/**
 * t-cherk-22, part B: the storefront's half of Tribute. The session is created
 * with both return addresses the backend requires, the pay button opens the
 * browser page in a browser and Tribute's own Mini App inside Telegram, and
 * nothing but an https address taken off the session is ever opened.
 */

const PAGE = "https://tribute.tg/shop/pay/ord_1"
const WEBAPP = "https://t.me/tribute/app?startapp=sord_1"

const session = (data: Record<string, unknown> = {}) => ({
  provider_id: "pp_tribute_tribute",
  data: { payment_url: PAGE, webapp_payment_url: WEBAPP, ...data },
})

const place = { origin: "https://cherkashino.ru", locale: "ru" }

describe("isTribute", () => {
  it("knows the Tribute provider and nothing else", () => {
    expect(isTribute("pp_tribute_tribute")).toBe(true)
    expect(isTribute("pp_robokassa_robokassa")).toBe(false)
    expect(isTribute("pp_system_default")).toBe(false)
    expect(isTribute(undefined)).toBe(false)
    expect(isTribute(null)).toBe(false)
  })
})

describe("tributeSessionData", () => {
  it("carries the success and the fail address the backend requires, both to the return route", () => {
    const data = tributeSessionData({ id: "cart_1", email: "buyer@example.com" }, place)

    expect(data).toEqual({
      success_url:
        "https://cherkashino.ru/api/payment-return?provider=tribute&cart_id=cart_1&outcome=success&locale=ru",
      fail_url:
        "https://cherkashino.ru/api/payment-return?provider=tribute&cart_id=cart_1&outcome=fail&locale=ru",
      email: "buyer@example.com",
    })
  })

  it("never hands Tribute the synthetic e-mail a Telegram buyer's cart starts with", () => {
    expect(tributeSessionData({ id: "cart_1", email: "tg_42@telegram.local" }, place)).not.toHaveProperty(
      "email"
    )
    expect(tributeSessionData({ id: "cart_1", email: null }, place)).not.toHaveProperty("email")
  })

  it("leaves the locale out when the page has none, and the return route takes the default", () => {
    expect(tributeReturnUrl("cart_1", { origin: "https://shop.example", locale: "" }, "fail")).toBe(
      "https://shop.example/api/payment-return?provider=tribute&cart_id=cart_1&outcome=fail"
    )
  })
})

describe("tributeSessionOf", () => {
  it("finds the Tribute session among the cart's sessions", () => {
    const cart = {
      payment_collection: {
        payment_sessions: [{ provider_id: "pp_robokassa_robokassa", data: {} }, session()],
      },
    }
    expect(tributeSessionOf(cart)).toEqual(session())
  })

  it("answers null for a cart with no Tribute session, or no cart at all", () => {
    expect(
      tributeSessionOf({ payment_collection: { payment_sessions: [{ provider_id: "pp_system_default" }] } })
    ).toBeNull()
    expect(tributeSessionOf(null)).toBeNull()
  })
})

describe("tributePaymentTarget: the browser and the Mini App", () => {
  it("in a browser opens the browser page", () => {
    expect(tributePaymentTarget(session(), { telegramLink: false })).toEqual({
      via: "redirect",
      url: PAGE,
    })
  })

  it("inside the Mini App opens Tribute's own Mini App through Telegram", () => {
    expect(tributePaymentTarget(session(), { telegramLink: true })).toEqual({
      via: "telegram",
      url: WEBAPP,
    })
  })

  it("inside the Mini App takes the browser page when the Mini App link is no t.me link", () => {
    for (const webapp of ["https://tribute.tg/app/ord_1", "http://t.me/tribute/app", "t.me/tribute", null]) {
      expect(
        tributePaymentTarget(session({ webapp_payment_url: webapp }), { telegramLink: true }),
        String(webapp)
      ).toEqual({ via: "redirect", url: PAGE })
    }
  })

  it("opens nothing but an https address", () => {
    for (const page of ["http://tribute.tg/pay", "javascript:alert(1)", "", 42, undefined]) {
      expect(
        tributePaymentTarget(session({ payment_url: page, webapp_payment_url: null }), {
          telegramLink: false,
        }),
        String(page)
      ).toBeNull()
    }
    expect(tributePaymentTarget(null, { telegramLink: true })).toBeNull()
  })
})

describe("openTributePayment: what the click does", () => {
  it("in a browser sends the page to Tribute's browser page", () => {
    const assign = vi.fn()

    expect(openTributePayment(session(), { openTelegramLink: null, assign })).toBe("redirect")
    expect(assign).toHaveBeenCalledWith(PAGE)
  })

  it("inside the Mini App hands the t.me link to Telegram and leaves the page where it is", () => {
    const assign = vi.fn()
    const openTelegramLink = vi.fn()

    expect(openTributePayment(session(), { openTelegramLink, assign })).toBe("telegram")
    expect(openTelegramLink).toHaveBeenCalledWith(WEBAPP)
    expect(assign).not.toHaveBeenCalled()
  })

  it("takes the browser page when Telegram refuses the link", () => {
    const assign = vi.fn()
    const openTelegramLink = vi.fn(() => {
      throw new Error("WebAppTgUrlInvalid")
    })

    expect(openTributePayment(session(), { openTelegramLink, assign })).toBe("redirect")
    expect(assign).toHaveBeenCalledWith(PAGE)
  })

  it("opens nothing for a session without an address, so the button can say so", () => {
    const assign = vi.fn()
    const openTelegramLink = vi.fn()

    expect(
      openTributePayment(session({ payment_url: null, webapp_payment_url: null }), {
        openTelegramLink,
        assign,
      })
    ).toBeNull()
    expect(openTributePayment(null, { openTelegramLink: null, assign })).toBeNull()
    expect(assign).not.toHaveBeenCalled()
    expect(openTelegramLink).not.toHaveBeenCalled()
  })
})

describe("telegramLinkOpener: how the button knows it runs in Telegram", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubWindow = (hash: string, webApp?: Record<string, unknown>) =>
    vi.stubGlobal("window", {
      location: { hash },
      sessionStorage: { getItem: () => null },
      Telegram: webApp ? { WebApp: webApp } : undefined,
    })

  it("is null in a browser, even one that loaded Telegram's script", () => {
    stubWindow("", { openTelegramLink: vi.fn() })
    expect(telegramLinkOpener()).toBeNull()
  })

  it("is the bridge's openTelegramLink in a page Telegram opened", () => {
    const openTelegramLink = vi.fn()
    stubWindow("#tgWebAppData=query_id%3D1&tgWebAppPlatform=ios", { openTelegramLink })

    telegramLinkOpener()?.(WEBAPP)
    expect(openTelegramLink).toHaveBeenCalledWith(WEBAPP)
  })

  it("is null in a Mini App whose client has no such bridge", () => {
    stubWindow("#tgWebAppPlatform=tdesktop", { ready: vi.fn() })
    expect(telegramLinkOpener()).toBeNull()
  })

  it("is null on the server", () => {
    expect(telegramLinkOpener()).toBeNull()
  })
})
