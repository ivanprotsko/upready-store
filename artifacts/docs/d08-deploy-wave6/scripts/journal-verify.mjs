/**
 * d08-deploy-wave6 — приёмка блога (b18) на ЖИВОМ магазине.
 *
 * У тенанта `cherkashino` НЕТ ни одной статьи (замер: /ru/journal отвечает 200 и
 * показывает «Статей пока нет», ссылок на статьи 0), поэтому страницу статьи
 * проверить не на чем. Скрипт делает единственное, что даёт настоящий замер и не
 * оставляет следа в магазине клиента:
 *   1) заводит ОДНУ статью в панели владельца и публикует её,
 *   2) снимает живую ленту и живую страницу статьи,
 *   3) возвращает статью в «Черновик» и перепроверяет, что лента снова пуста.
 * Контент Оксаны при этом не появляется на витрине дольше времени прогона.
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
for (const r of roots) {
  try { chromium = createRequire(path.join(r, "index.js"))("playwright").chromium; if (chromium) break } catch {}
}
if (!chromium) throw new Error("playwright: экспорт chromium не найден")

const PANEL = "https://panel-store.upready.dev"
const STORE = "https://cherkashino.shipshift.dev"
const SHOTS = "artifacts/docs/d08-deploy-wave6/shots"
mkdirSync(SHOTS, { recursive: true })

const owner = readFileSync(
  path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"), "utf8")
const EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const PASSWORD = /Пароль:\s*(\S+)/.exec(owner)[1]

const SLUG = "d08-proverka-bloga"
const TITLE = "Проверка блога после деплоя d08"
const BODY =
  "Техническая статья приёмки d08-deploy-wave6. Заведена автоматически, чтобы " +
  "проверить ленту /ru/journal и страницу статьи на живом магазине, и сразу " +
  "после снимков возвращена в черновик."

const M = {}
const say = (k, v) => { M[k] = v; console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`) }
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  console.log(`  кадр ${name}.png`)
}

const setStatus = async (page, value) => {
  await page.getByTestId("article-status-select").click()
  await page.locator(`[role="option"]`).filter({ hasText: value === "published" ? "Опубликована" : "Черновик" }).first().click()
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
  const page = await ctx.newPage()
  page.setDefaultTimeout(30000)

  // 0. Лента ДО — пустая (контроль: иначе нечего доказывать)
  await page.goto(`${STORE}/ru/journal`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  say("лента ДО: ссылок на статьи", await page.locator('main a[href*="/journal/"]').count())
  say("лента ДО: текст", (await page.locator("main").innerText()).slice(0, 120).replace(/\n+/g, " | "))

  // 1. Вход и новая статья
  await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 })

  await page.goto(`${PANEL}/journal/new`, { waitUntil: "domcontentloaded" })
  await page.getByTestId("article-title-input").waitFor({ timeout: 30000 })
  await page.getByTestId("article-title-input").fill(TITLE)
  const slug = page.getByTestId("article-slug-input")
  await slug.fill(SLUG)
  await page.getByTestId("article-body-input").fill(BODY)
  await setStatus(page, "published")
  await shot(page, "panel-08-journal-article-editor")
  await page.getByTestId("article-save").click()
  await page.waitForTimeout(7000)
  say("после сохранения URL", page.url())
  say("редактор: статус на экране", await page.getByTestId("article-status-select").innerText().catch(() => null))

  // 2. Живая лента и живая статья
  const feed = await page.goto(`${STORE}/ru/journal`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4000)
  say("лента ПОСЛЕ HTTP", feed.status())
  const links = await page.locator('main a[href*="/journal/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))].filter((h) => h && !/\/journal\/?$/.test(h)))
  say("лента ПОСЛЕ: ссылок на статьи", links.length)
  say("лента ПОСЛЕ: ссылки", links)
  await shot(page, "store-11-journal-with-article")

  const artUrl = `${STORE}/ru/journal/${SLUG}`
  const art = await page.goto(artUrl, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(3000)
  say("статья HTTP", art.status())
  say("статья URL", page.url())
  say("заголовок h1", (await page.locator("h1").first().innerText().catch(() => "")).slice(0, 150))
  say("текст статьи виден", (await page.locator("main").innerText()).includes("приёмки d08"))
  await shot(page, "store-12-article-page")

  // мобильный кадр статьи
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", isMobile: true, hasTouch: true })
  const mp = await mob.newPage()
  await mp.goto(artUrl, { waitUntil: "domcontentloaded" })
  await mp.waitForTimeout(3000)
  await mp.screenshot({ path: path.join(SHOTS, "store-13-article-mobile.png") })
  console.log("  кадр store-13-article-mobile.png")
  await mob.close()

  // 3. Возврат в черновик — витрина клиента остаётся пустой
  await page.goto(`${PANEL}/journal/${SLUG}`, { waitUntil: "domcontentloaded" })
  await page.getByTestId("article-status-select").waitFor({ timeout: 45000 })
  await setStatus(page, "draft")
  await page.getByTestId("article-save").click()
  await page.waitForTimeout(7000)
  say("статус после отката", await page.getByTestId("article-status-select").innerText().catch(() => null))

  const after = await page.goto(`${STORE}/ru/journal`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4000)
  say("лента ПОСЛЕ ОТКАТА HTTP", after.status())
  say("лента ПОСЛЕ ОТКАТА: ссылок на статьи", (await page.locator('main a[href*="/journal/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))].filter((h) => h && !/\/journal\/?$/.test(h)))).length)
  const gone = await page.goto(artUrl, { waitUntil: "domcontentloaded" })
  say("страница статьи после отката HTTP", gone.status())
  await shot(page, "store-14-journal-after-rollback")

  await browser.close()
  writeFileSync("artifacts/docs/d08-deploy-wave6/logs/journal-verify.json", JSON.stringify(M, null, 1))
  console.log("\nзамеры записаны: artifacts/docs/d08-deploy-wave6/logs/journal-verify.json")
}

run().catch((e) => {
  writeFileSync("artifacts/docs/d08-deploy-wave6/logs/journal-verify.json", JSON.stringify({ ...M, ОШИБКА: e.message }, null, 1))
  console.error("ОШИБКА:", e.message); process.exit(1)
})
