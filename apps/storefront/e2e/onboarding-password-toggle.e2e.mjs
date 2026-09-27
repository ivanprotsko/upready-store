#!/usr/bin/env node
/**
 * The onboarding wizard's password field shows/hides its value on click
 * (t-2026-09-27-05, Ivan 2026-09-27: «в поле пароля была иконка просмотра
 * введенного пароля»), at 1440 and 390. No container, the way `funnel.e2e.mjs`
 * runs (Ivan's order 2026-09-15: no Docker on the development machine).
 *
 *   STOREFRONT_URL=http://localhost:8261 node e2e/onboarding-password-toggle.e2e.mjs
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url).pathname
const { chromium } = require(PLAYWRIGHT)

const STOREFRONT = (process.env.STOREFRONT_URL || "http://localhost:8261").replace(/\/$/, "")
const SHOTS = process.env.SHOTS_DIR || ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

async function checkOneViewport(browser, viewport) {
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(60000)
  page.setDefaultNavigationTimeout(90000)
  await page.goto(`${STOREFRONT}/start/onboarding?tariff=pro&trial=3`, { waitUntil: "networkidle" })

  await page.getByTestId("demo-shop-name").fill(`Toggle check ${viewport.width}`)
  await page.getByTestId("demo-step1-next").click()

  const input = page.getByTestId("demo-owner-password")
  const toggle = page.getByTestId("demo-owner-password-toggle")
  await input.fill("Sup3rSecret!")

  check(`${viewport.width}: starts as type=password`, (await input.getAttribute("type")) === "password")
  check(`${viewport.width}: toggle starts aria-pressed=false`, (await toggle.getAttribute("aria-pressed")) === "false")
  check(`${viewport.width}: toggle starts labelled «Показать пароль»`, (await toggle.getAttribute("aria-label")) === "Показать пароль")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/password-hidden-${viewport.width}.png` })

  await toggle.click()
  check(`${viewport.width}: click reveals — type=text`, (await input.getAttribute("type")) === "text")
  check(`${viewport.width}: revealed value unchanged`, (await input.inputValue()) === "Sup3rSecret!")
  check(`${viewport.width}: toggle now aria-pressed=true`, (await toggle.getAttribute("aria-pressed")) === "true")
  check(`${viewport.width}: toggle now labelled «Скрыть пароль»`, (await toggle.getAttribute("aria-label")) === "Скрыть пароль")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/password-shown-${viewport.width}.png` })

  await toggle.click()
  check(`${viewport.width}: click again hides — type=password`, (await input.getAttribute("type")) === "password")

  // The toggle is a type="button": it must never submit or advance the wizard.
  check(`${viewport.width}: still on step 2 after two toggle clicks`, (await page.getByTestId("demo-owner-password").isVisible()) === true)

  await toggle.focus()
  check(`${viewport.width}: toggle is keyboard-reachable (Tab order)`, await toggle.evaluate((el) => el === document.activeElement))

  await page.close()
}

const browser = await chromium.launch()
await checkOneViewport(browser, { width: 1440, height: 900 })
await checkOneViewport(browser, { width: 390, height: 844 })
await browser.close()

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
