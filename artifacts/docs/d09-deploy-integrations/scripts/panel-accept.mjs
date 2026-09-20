/**
 * d09-deploy-integrations — приёмка волны p01 на ЖИВОЙ панели как владелица.
 *
 * Проверяется ровно то, что заказал Иван 2026-09-16 20:22 WITA:
 *   1. /settings/integrations — пять служб, Wildberries «подключено ••••last4»
 *      с правами и сроком (ключ Иван ввёл сам ~20:00 WITA и он обязан пережить
 *      деплой БЕЗ повторного ввода);
 *   2. /settings/marketplaces/wildberries — загруженные таблицы;
 *   3. старые адреса редиректят на новые;
 *   4. в сайдбаре ни одного пункта с якорем '#'.
 *
 * Пароль владелицы читается из ~/upready/.private/... в момент прогона и
 * НИКОГДА не печатается; перед каждым кадром страница проверяется на утечку
 * (детектор из d08). Кадры 1280x900 — бинарники вне git.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { execSync } from "node:child_process"

const roots = [
  path.join(homedir(), "upready/projects/upready-store/node_modules"),
  (() => { try { return execSync("npm root -g", { encoding: "utf8" }).trim() } catch { return "" } })(),
].filter(Boolean)
let chromium = null
for (const root of roots) {
  try {
    chromium = createRequire(path.join(root, "index.js"))("playwright").chromium
    if (chromium) { console.log(`playwright: ${root}`); break }
  } catch { /* следующий корень */ }
}
if (!chromium) throw new Error(`playwright: экспорт chromium не найден (искал в ${roots.join(", ")})`)

const PANEL = process.env.PANEL_URL ?? "https://panel-store.upready.dev"
const SHOTS = process.env.SHOTS_DIR ?? "artifacts/docs/d09-deploy-integrations/shots"
mkdirSync(SHOTS, { recursive: true })

const owner = readFileSync(
  path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"),
  "utf8",
)
const OWNER_EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const OWNER_PASSWORD = /Пароль:\s*(\S+)/.exec(owner)[1]
const SECRETS = [["OWNER_PASSWORD", OWNER_PASSWORD]].filter(([, v]) => v && v.length >= 8)

const visibleText = (page) =>
  page.evaluate(() => {
    const parts = [document.body.innerText]
    for (const el of document.querySelectorAll("input, textarea")) {
      const masked = el.type === "password" || getComputedStyle(el).webkitTextSecurity === "disc"
      if (!masked) parts.push(el.value ?? "")
    }
    return parts.join("\n")
  })

const shot = async (page, name) => {
  const seen = await visibleText(page)
  for (const [k, v] of SECRETS) if (seen.includes(v)) throw new Error(`УТЕЧКА: ${k} виден на кадре ${name}`)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  console.log(`  кадр ${name}.png`)
  return seen
}


/**
 * Ждём, пока список служб ДОГРУЗИТСЯ. Первый прогон снял кадр на «Загрузка…»
 * и «подключено ••••» в тексте принадлежало Robokassa, а не Wildberries —
 * то есть замер был про состояние загрузки, а не про результат (правило 20a).
 * Ждём положительный признак: в тексте есть Wildberries И нет «Загрузка…»
 * И ни одна карточка не говорит «спрашиваем…».
 */
const waitLoaded = async (page, label, ms = 60000) => {
  const started = Date.now()
  while (Date.now() - started < ms) {
    const t = await visibleText(page)
    if (/Wildberries/i.test(t) && !/Загрузка…/.test(t) && !/спрашиваем…/.test(t)) {
      console.log(`  ${label}: догрузилось за ${Math.round((Date.now() - started) / 1000)}с`)
      return t
    }
    await page.waitForTimeout(2000)
  }
  console.log(`  ${label}: НЕ догрузилось за ${ms / 1000}с — снимаю как есть`)
  return await visibleText(page)
}

/**
 * Текст ОДНОЙ карточки службы: от её заголовка до следующего «Открыть».
 * Нужен, чтобы «подключено ••••XzML» не приписать чужой службе.
 */
const cardText = (all, name) => {
  const i = all.indexOf(name)
  if (i < 0) return ""
  const j = all.indexOf("Открыть", i)
  return all.slice(i, j < 0 ? i + 400 : j + 7)
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
  const page = await ctx.newPage()
  const out = { shots: [], checks: {} }

  console.log("1. вход в панель как владелица")
  await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(OWNER_EMAIL)
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 45000 })
  console.log(`  вошли, url=${page.url()}`)

  console.log("2. /settings/integrations — список подключений")
  await page.goto(`${PANEL}/settings/integrations`, { waitUntil: "domcontentloaded" })
  const integrations = await waitLoaded(page, "integrations")
  await shot(page, "01-settings-integrations-1280x900")
  out.checks.integrationsUrl = page.url()
  out.checks.integrationsText = integrations.slice(0, 3000)
  out.checks.stillLoading = /Загрузка…|спрашиваем…/.test(integrations)
  for (const name of ["Wildberries", "Ozon", "Robokassa", "ApiShip", "СДЭК"]) {
    const card = cardText(integrations, name)
    out.checks[`карточка:${name}`] = card.replace(/\n+/g, " | ").slice(0, 220)
  }
  const wbCard = cardText(integrations, "Wildberries")
  out.checks.wbПодключено = /подключено/i.test(wbCard) && !/не подключено/i.test(wbCard)
  out.checks.wbМаскаLast4 = /[•*]{3,}\s*[A-Za-z0-9]{2,6}/.test(wbCard)

  console.log("3. /settings/integrations/wildberries — карточка службы")
  await page.goto(`${PANEL}/settings/integrations/wildberries`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4000)
  const wbCardPage = await shot(page, "02-integrations-wildberries-1280x900")
  out.checks.wbCardUrl = page.url()
  out.checks.wbCardText = wbCardPage.replace(/\n+/g, " | ").slice(0, 900)

  console.log("4. /settings/marketplaces/wildberries — таблицы маркетплейса")
  await page.goto(`${PANEL}/settings/marketplaces/wildberries`, { waitUntil: "domcontentloaded" })
  const mp = await waitLoaded(page, "marketplaces")
  await shot(page, "03-marketplaces-wildberries-1280x900")
  out.checks.mpUrl = page.url()
  out.checks.mpText = mp.slice(0, 2500)
  out.checks.mpTableRows = await page.locator("table tbody tr").count()
  out.checks.mpTables = await page.locator("table").count()
  out.checks.mpGridRows = await page.locator('[role="row"]').count()
  out.checks.mpText = mp.replace(/\n+/g, " | ").slice(0, 1500)

  console.log("5. старые адреса → редирект")
  for (const oldPath of ["/settings/wildberries", "/settings/marketplaces", "/settings/ozon"]) {
    await page.goto(`${PANEL}${oldPath}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    out.checks[`редирект ${oldPath}`] = page.url().replace(PANEL, "")
    out.checks[`страница ${oldPath}`] = (await visibleText(page)).replace(/\n+/g, " | ").slice(0, 300)
  }
  await shot(page, "04-after-old-url-redirect-1280x900")

  console.log("6. сайдбар: пункты с якорем '#'")
  await page.goto(`${PANEL}/settings/integrations`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(3000)
  out.checks.sidebarAnchorHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("nav a, aside a"))
      .map((a) => a.getAttribute("href") || "")
      .filter((h) => h.includes("#")),
  )
  out.checks.sidebarLinkCount = await page.evaluate(
    () => document.querySelectorAll("nav a, aside a").length,
  )

  await browser.close()
  writeFileSync(
    path.join(SHOTS, "..", "accept-measurements.json"),
    JSON.stringify(out, null, 2) + "\n",
  )
  console.log("\n=== ИТОГ ===")
  for (const [k, v] of Object.entries(out.checks)) {
    if (k.endsWith("Text")) continue
    console.log(`${k} = ${JSON.stringify(v)}`)
  }
}

run().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1) })
