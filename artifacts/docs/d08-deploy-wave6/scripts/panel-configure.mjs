/**
 * d08-deploy-wave6 — настройка тенанта `cherkashino` ЧЕРЕЗ ПАНЕЛЬ владельца
 * на живой платформе (https://panel-store.upready.dev).
 *
 * Почему скрипт, а не руки: два экрана настроек, девять полей с секретами и
 * пять снимков — прокликивание стоит дороже и не повторяется при приёмке.
 * Скрипт идемпотентен: повторный прогон вводит те же значения.
 *
 * Секреты НИКОГДА не попадают ни в артефакты, ни в лог: значения читаются из
 * `~/upready/.env.keys` и `chrxnasdmds/apps/backend/.env` в момент прогона, а
 * перед КАЖДЫМ снимком страница проверяется на утечку (детектор ниже) — как в
 * i02, где такой же детектор поймал логины на скриншоте панели.
 */
import { chromium } from "playwright"
import { readFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const PANEL = process.env.PANEL_URL ?? "https://panel-store.upready.dev"
const SHOTS = process.env.SHOTS_DIR ?? "artifacts/docs/d08-deploy-wave6/shots"
mkdirSync(SHOTS, { recursive: true })

/** Читает `KEY=value` из dotenv-подобного файла. Значение не печатается никогда. */
const dotenv = (file) => {
  const out = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const keys = dotenv(path.join(homedir(), "upready/.env.keys"))
const ref = dotenv(path.join(homedir(), "upready/projects/chrxnasdmds/apps/backend/.env"))
const owner = readFileSync(
  path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"),
  "utf8",
)
const OWNER_EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const OWNER_PASSWORD = /Пароль:\s*(\S+)/.exec(owner)[1]

/**
 * Всё, что не должно оказаться ни в одном кадре и ни в одной строке лога.
 * Короткие значения (<8) отброшены: они дают ложные срабатывания на разметке.
 */
const SECRETS = [
  OWNER_PASSWORD,
  ref.ROBOKASSA_TEST_PASSWORD_1,
  ref.ROBOKASSA_TEST_PASSWORD_2,
  ref.ROBOKASSA_PASSWORD_1,
  ref.ROBOKASSA_PASSWORD_2,
  keys.CHEROXANA_CDEK_TEST_ACCOUNT_ID,
  keys.CHEROXANA_CDEK_TEST_ACCOUNT_SECRET_PASSWORD,
  keys.CDEK_API_ACCOUNT,
  keys.CDEK_API_PASSWORD,
].filter((v) => typeof v === "string" && v.length >= 8)

const required = (name, value) => {
  if (!value) throw new Error(`секрет ${name} не найден — настройка не начата`)
  return value
}

/** Кадр снимается только после проверки: секрета в DOM нет. */
const shot = async (page, name) => {
  const html = await page.content()
  for (const s of SECRETS) {
    if (html.includes(s)) throw new Error(`УТЕЧКА: секрет виден в DOM на кадре ${name}`)
  }
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  console.log(`  кадр ${name}.png`)
}

/** Medusa UI Switch — это button[role=switch]; выставляем в нужное состояние. */
const setSwitch = async (page, id, on) => {
  const el = page.locator(`#${id}`)
  await el.waitFor({ state: "visible", timeout: 15000 })
  const now = (await el.getAttribute("aria-checked")) === "true"
  if (now !== on) await el.click()
  const after = (await el.getAttribute("aria-checked")) === "true"
  if (after !== on) throw new Error(`переключатель ${id}: хотели ${on}, получили ${after}`)
}

const fill = async (page, id, value) => {
  const el = page.locator(`#${id}`)
  await el.waitFor({ state: "visible", timeout: 15000 })
  await el.fill(value)
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
  const page = await ctx.newPage()
  const results = {}

  // Ответы панельного API — источник правды о том, что реально записалось.
  const api = []
  page.on("response", async (r) => {
    const u = r.url()
    if (/\/tenants\/(payment|delivery)-settings/.test(u)) {
      let body = null
      try { body = await r.json() } catch { body = null }
      api.push({ method: r.request().method(), url: u.replace(PANEL, ""), status: r.status(), body })
    }
  })

  console.log("1. вход в панель как владелец")
  await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(OWNER_EMAIL)
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 })
  console.log(`  вошли, url=${page.url()}`)

  console.log("2. Настройки → Приём оплат (Robokassa, ТЕСТОВЫЙ режим)")
  await page.goto(`${PANEL}/settings/payments`, { waitUntil: "domcontentloaded" })
  await page.locator("#merchant_login").waitFor({ state: "visible", timeout: 30000 })
  await fill(page, "merchant_login", required("ROBOKASSA_MERCHANT_LOGIN", ref.ROBOKASSA_MERCHANT_LOGIN))
  await fill(page, "test_password1", required("ROBOKASSA_TEST_PASSWORD_1", ref.ROBOKASSA_TEST_PASSWORD_1))
  await fill(page, "test_password2", required("ROBOKASSA_TEST_PASSWORD_2", ref.ROBOKASSA_TEST_PASSWORD_2))
  await setSwitch(page, "is_test", true)
  await setSwitch(page, "is_enabled", true)
  await shot(page, "panel-01-payments-filled")
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(4000)
  await shot(page, "panel-02-payments-saved")
  results.resultUrl = await page.locator('[data-testid="robokassa-result-url"]').innerText().catch(() => null)

  console.log("3. Настройки → Доставка (СДЭК, ТЕСТОВЫЙ контур)")
  await page.goto(`${PANEL}/settings/delivery`, { waitUntil: "domcontentloaded" })
  await page.locator("#test_account").waitFor({ state: "visible", timeout: 30000 })
  await fill(page, "test_account", required("CHEROXANA_CDEK_TEST_ACCOUNT_ID", keys.CHEROXANA_CDEK_TEST_ACCOUNT_ID))
  await fill(page, "test_password", required("CHEROXANA_CDEK_TEST_ACCOUNT_SECRET_PASSWORD", keys.CHEROXANA_CDEK_TEST_ACCOUNT_SECRET_PASSWORD))
  await fill(page, "sender_city_name", keys.CDEK_ORIGIN_CITY || "Москва")
  await fill(page, "sender_name", ref.APISHIP_SENDER_NAME || "Магазин Черкашина")
  for (const kind of ["courier", "pickup"]) {
    const cb = page.locator(`#kind-${kind}`)
    if ((await cb.getAttribute("aria-checked")) !== "true") await cb.click()
  }
  await setSwitch(page, "is_test", true)
  await setSwitch(page, "is_enabled", true)
  // Поле аккаунта — текстовое: маскируем ЕГО ЖЕ, а не весь кадр.
  await page.addStyleTag({ content: "#test_account,#account{ -webkit-text-security: disc; }" })
  await shot(page, "panel-03-delivery-filled")
  await page.locator('[data-testid="cdek-save"]').click()
  await page.waitForTimeout(8000)
  await page.addStyleTag({ content: "#test_account,#account{ -webkit-text-security: disc; }" })
  await shot(page, "panel-04-delivery-saved")
  results.cdekMethods = await page.locator('[data-testid="cdek-methods"]').innerText().catch(() => null)

  console.log("4. кадры остальных экранов волны")
  for (const [route, name] of [
    ["/settings/marketplaces", "panel-05-marketplaces-hub"],
    ["/settings/wildberries", "panel-06-wildberries-key-form"],
    ["/journal", "panel-07-journal-editor"],
  ]) {
    await page.goto(`${PANEL}${route}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(4000)
    await shot(page, name)
    results[name] = (await page.locator("body").innerText()).slice(0, 600)
  }

  await browser.close()
  console.log("\n=== ОТВЕТЫ ПАНЕЛЬНОГО API ===")
  console.log(JSON.stringify(api, null, 1))
  console.log("\n=== ЧТО НА ЭКРАНАХ ===")
  console.log(JSON.stringify(results, null, 1))
}

run().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1) })
