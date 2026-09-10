import { expect, test, type Browser, type BrowserContext } from "@playwright/test"

/**
 * Locale on entry (task order t-2026-09-10-01): a visitor who opens the stand with no
 * locale in the URL gets Russian when Russian stands anywhere in the browser's
 * Accept-Language, otherwise the first language of that list the storefront ships;
 * a pick in the language switcher is remembered for a year, and following a prefixed
 * link (`/en/...`) never pins that language for the next bare visit.
 *
 * Every case here is a fresh browser context with its own Accept-Language, walking the
 * LIVE stand — the middleware's 302 and the `<html lang>` it produces are the evidence.
 */

const RU_FIRST = "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
const IVANS_CHROME = "en-US,en;q=0.9,ru;q=0.8" // measured on this Mac, 2026-09-10
const EN_ONLY = "en-US,en;q=0.9"
const DE_FIRST = "de-DE,de;q=0.9,en;q=0.8"

const baseUrl = () => String(test.info().project.use.baseURL)

async function browserWith(browser: Browser, acceptLanguage: string) {
  return browser.newContext({
    extraHTTPHeaders: { "accept-language": acceptLanguage },
  })
}

async function land(context: BrowserContext, path = "/") {
  const page = await context.newPage()
  await page.goto(path)
  await page.locator("html[lang]").waitFor()
  const pathname = new URL(page.url()).pathname
  const lang = await page.locator("html").getAttribute("lang")
  await page.close()
  return { pathname, lang }
}

async function cookie(context: BrowserContext, name: string) {
  return (await context.cookies(baseUrl())).find((c) => c.name === name)?.value
}

test.describe("locale-on-entry", () => {
  test("a Russian-first browser lands on /ru", async ({ browser }) => {
    const context = await browserWith(browser, RU_FIRST)
    expect(await land(context)).toEqual({ pathname: "/ru", lang: "ru" })
    expect(await cookie(context, "_medusa_locale")).toBe("ru")
    await context.close()
  })

  test("a browser with English first and Russian further down lands on /ru", async ({
    browser,
  }) => {
    const context = await browserWith(browser, IVANS_CHROME)
    expect(await land(context)).toEqual({ pathname: "/ru", lang: "ru" })
    await context.close()
  })

  test("a browser without Russian follows its own first supported language", async ({
    browser,
  }) => {
    const en = await browserWith(browser, EN_ONLY)
    expect(await land(en)).toEqual({ pathname: "/en", lang: "en" })
    await en.close()

    const de = await browserWith(browser, DE_FIRST)
    expect(await land(de)).toEqual({ pathname: "/de", lang: "de" })
    await de.close()
  })

  test("a stale _medusa_locale=en cookie no longer pins a Russian browser to English", async ({
    browser,
  }) => {
    const context = await browserWith(browser, RU_FIRST)
    await context.addCookies([{ name: "_medusa_locale", value: "en", url: baseUrl() }])
    expect(await land(context)).toEqual({ pathname: "/ru", lang: "ru" })
    await context.close()
  })

  test("following an /en link serves English there and leaves the next bare visit to the browser", async ({
    browser,
  }) => {
    const context = await browserWith(browser, RU_FIRST)
    expect(await land(context, "/en/store")).toEqual({ pathname: "/en/store", lang: "en" })
    expect(await cookie(context, "_medusa_locale")).toBe("en")
    expect(await cookie(context, "_medusa_locale_choice")).toBeUndefined()
    expect(await land(context)).toEqual({ pathname: "/ru", lang: "ru" })
    await context.close()
  })

  test("a language picked in the switcher wins over the browser on the next bare visit", async ({
    browser,
  }) => {
    const context = await browserWith(browser, EN_ONLY)
    const page = await context.newPage()
    await page.goto("/")
    await expect(page).toHaveURL(/\/en$/)

    const trigger = page.getByTestId("nav-region-select-button")
    if ((await trigger.count()) === 0) {
      test.skip(
        true,
        "this stand's header variant carries no language switcher (h5); the pick is covered on the stands that have one"
      )
    }
    await trigger.click()
    await page.locator("#region-language-ru").click()
    await page.getByRole("button", { name: /^(Apply|Применить)$/ }).click()
    await expect(page).toHaveURL(/\/ru(\/|$)/)
    await expect(page.locator("html")).toHaveAttribute("lang", "ru")
    await page.close()

    expect(await cookie(context, "_medusa_locale_choice")).toBe("ru")
    expect(await land(context)).toEqual({ pathname: "/ru", lang: "ru" })
    await context.close()
  })
})
