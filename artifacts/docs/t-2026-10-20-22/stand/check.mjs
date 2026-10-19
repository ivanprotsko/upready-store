import { createRequire } from "node:module"
const require = createRequire("/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/storefront/package.json")
const { chromium } = require("@playwright/test")
const BASE = "http://localhost:8000"
const SHOTS = process.argv[2]
const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
const results = []
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`) }
const browser = await chromium.launch({ executablePath: "/Users/ivanprotsko/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome" })
const ctx = async (o = {}) => browser.newContext({ userAgent: CHROME_UA, viewport: { width: 1280, height: 800 }, ...o })
const popup = (page) => page.getByTestId("region-popup-other")
const consoleErrors = new Set()
const openPage = async (c, path) => { const p = await c.newPage(); p.on("console", (m) => { if (m.type() === "error") consoleErrors.add(m.text().slice(0, 200)) }); await p.goto(BASE + path, { waitUntil: "networkidle" }); return p }

// Screenshots: ru/en × desktop/mobile × light/dark
for (const [loc, w, h, ua, scheme] of [
  ["en", 1280, 800, CHROME_UA, "light"], ["ru", 1280, 800, CHROME_UA, "light"],
  ["en", 390, 844, IPHONE_UA, "light"], ["ru", 390, 844, IPHONE_UA, "light"],
  ["en", 1280, 800, CHROME_UA, "dark"], ["ru", 390, 844, IPHONE_UA, "dark"],
]) {
  const c = await ctx({ viewport: { width: w, height: h }, userAgent: ua, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500 })
  const p = await openPage(c, `/${loc}`)
  await popup(p).waitFor({ timeout: 15000 }).catch(() => {})
  const shown = await popup(p).isVisible()
  ok(`popup shows ${loc} ${w}px ${scheme}`, shown)
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${SHOTS}/popup-${loc}-${w < 500 ? "mobile" : "desktop"}-${scheme}.png` })
  await c.close()
}

// Accessibility: role, name, focus inside, Esc closes and remembers for the session only
{
  const c = await ctx(); const p = await openPage(c, "/en")
  const dlg = p.getByRole("dialog", { name: "Where are you shopping from?" })
  await popup(p).waitFor({ timeout: 15000 })
  ok("dialog has role and accessible name", (await dlg.count()) === 1)
  const focusedInside = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  ok("focus moves into the dialog", focusedInside)
  const described = await dlg.getAttribute("aria-describedby")
  ok("dialog is described", !!described)
  await p.keyboard.press("Escape")
  await p.waitForTimeout(500)
  ok("Esc closes it", !(await popup(p).isVisible()))
  const ck = (await c.cookies()).find((x) => x.name === "_region_choice")
  ok("Esc writes a session cookie", ck?.value === "dismissed" && ck.expires === -1, JSON.stringify(ck))
  await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800)
  ok("no popup after Esc in the same session", !(await popup(p).isVisible()))
  await c.close()
}

// Kazakhstan: stays, remembered a year, region switched
{
  const c = await ctx(); const p = await openPage(c, "/ru")
  await popup(p).waitFor({ timeout: 15000 })
  const rows = await p.locator('[data-testid^="region-popup-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))
  ok("rows: Russia, Kazakhstan, US, Other", JSON.stringify(rows) === JSON.stringify(["region-popup-close", "region-popup-ru", "region-popup-kz", "region-popup-us", "region-popup-other"]), JSON.stringify(rows))
  ok("Russia row names the target", (await p.getByTestId("region-popup-ru").innerText()).includes("cherkashino.ru"), await p.getByTestId("region-popup-ru").innerText())
  await p.getByTestId("region-popup-kz").click()
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(800)
  const cs = await c.cookies()
  const ck = cs.find((x) => x.name === "_region_choice")
  const days = ck ? (ck.expires - Date.now() / 1000) / 86400 : 0
  ok("Kazakhstan remembered for a year", ck?.value === "kz" && days > 364, `${ck?.value} ${Math.round(days)} days`)
  ok("Kazakhstan, not among this shop's regions, keeps the prices", cs.find((x) => x.name === "_medusa_country")?.value === "ru", cs.find((x) => x.name === "_medusa_country")?.value)
  ok("stays on this shop", p.url().startsWith(BASE + "/ru"), p.url())
  await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800)
  ok("no popup after an answer", !(await popup(p).isVisible()))
  await c.close()
}

// A country the shop serves switches the prices
{
  const c = await ctx(); const p = await openPage(c, "/ru")
  await popup(p).waitFor({ timeout: 15000 })
  await p.getByTestId("region-popup-us").click()
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500)
  const cs = await c.cookies()
  ok("United States switches the region", cs.find((x) => x.name === "_medusa_country")?.value === "us" && cs.find((x) => x.name === "_region_choice")?.value === "us", cs.filter((x) => x.name.startsWith("_")).map((x) => x.name + "=" + x.value).join(" "))
  ok("and stays on the page", p.url() === BASE + "/ru", p.url())
  await c.close()
}

// Other country
{
  const c = await ctx(); const p = await openPage(c, "/en/store")
  await popup(p).waitFor({ timeout: 15000 })
  await p.getByTestId("region-popup-other").click(); await p.waitForTimeout(500)
  const ck = (await c.cookies()).find((x) => x.name === "_region_choice")
  ok("Other closes and is remembered", !(await popup(p).isVisible()) && ck?.value === "other", ck?.value)
  ok("Other stays on the page", p.url() === BASE + "/en/store", p.url())
  await c.close()
}

// Russia: redirect to the RU shop's home, nothing remembered
{
  const c = await ctx()
  await c.route("https://cherkashino.ru/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>cherkashino.ru stub</title>" }))
  const p = await openPage(c, "/en/store")
  await popup(p).waitFor({ timeout: 15000 })
  await Promise.all([p.waitForURL("https://cherkashino.ru/**", { timeout: 15000 }), p.getByTestId("region-popup-ru").click()])
  ok("Russia sends to https://cherkashino.ru/", p.url() === "https://cherkashino.ru/", p.url())
  const ck = (await c.cookies(BASE)).find((x) => x.name === "_region_choice")
  ok("Russia is not remembered", !ck, JSON.stringify(ck))
  await c.close()
}

// Robots and previews
for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "TelegramBot (like TwitterBot)", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"]) {
  const c = await ctx({ userAgent: ua }); const p = await openPage(c, "/en"); await p.waitForTimeout(1500)
  ok(`no popup for ${ua.slice(0, 40)}`, (await popup(p).count()) === 0)
  await c.close()
}

// Region switcher lists Russia with the RU shop's address, and a pick goes there
{
  const c = await ctx({ viewport: { width: 1280, height: 800 } })
  await c.addCookies([{ name: "_region_choice", value: "other", url: BASE }])
  await c.route("https://cherkashino.ru/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "stub" }))
  const p = await openPage(c, "/en")
  ok("no popup once answered", (await popup(p).count()) === 0)
  const btn = p.getByTestId("nav-country-select-button").first()
  if (await btn.isVisible()) {
    await btn.click(); await p.waitForTimeout(600)
    const row = p.locator('label[for="region-country-ru"]')
    ok("switcher lists Russia → cherkashino.ru", (await row.innerText().catch(() => "")).includes("cherkashino.ru"), await row.innerText().catch(() => "none"))
    await p.screenshot({ path: `${SHOTS}/switcher-en-desktop-light.png` })
    await row.click()
    await Promise.all([p.waitForURL("https://cherkashino.ru/**", { timeout: 15000 }).catch(() => {}), p.getByRole("button", { name: "Apply" }).click()])
    ok("switcher pick of Russia goes to cherkashino.ru", p.url() === "https://cherkashino.ru/", p.url())
  } else ok("switcher button visible", false)
  await c.close()
}
await browser.close()
console.log(results.join("\n")); console.log("console errors:\n" + [...consoleErrors].join("\n"))
