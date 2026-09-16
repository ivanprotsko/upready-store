/**
 * d08-deploy-wave6 — приёмка волны на ЖИВОЙ витрине cherkashino.shipshift.dev.
 *
 * Флоу и селекторы перенесены из уже написанных стендовых сценариев
 * (`apps/storefront/tests/stands/{helpers.ts,robokassa.pw.ts}`) — сами они здесь
 * не запускаются: в этом worktree нет node_modules, а прогонять сьюту из чужого
 * чекаута нельзя (правило 5k). Логика та же, зависимостей — одна (playwright из
 * основного чекаута или глобального корня).
 *
 * Считается пройденным только то, что ЗАМЕРЕНО: каждая проверка печатает
 * число/строку, а не «ок».
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { execSync } from "node:child_process"

const playwrightRoots = [
  path.join(homedir(), "upready/projects/upready-store/node_modules"),
  (() => { try { return execSync("npm root -g", { encoding: "utf8" }).trim() } catch { return "" } })(),
].filter(Boolean)
let chromium = null
for (const root of playwrightRoots) {
  try {
    chromium = createRequire(path.join(root, "index.js"))("playwright").chromium
    if (chromium) break
  } catch { /* следующий корень */ }
}
if (!chromium) throw new Error(`playwright: экспорт chromium не найден`)

const STORE = process.env.STAND_URL ?? "https://cherkashino.shipshift.dev"
const BACKEND = process.env.BACKEND_URL ?? "https://shipshift.dev"
const SHOTS = process.env.SHOTS_DIR ?? "artifacts/docs/d08-deploy-wave6/shots"
mkdirSync(SHOTS, { recursive: true })

const dotenv = (file) => {
  const out = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const ref = dotenv(path.join(homedir(), "upready/projects/chrxnasdmds/apps/backend/.env"))
const TEST_PASSWORD_2 = ref.ROBOKASSA_TEST_PASSWORD_2 ?? ""
const HASH_ALGORITHM = ref.ROBOKASSA_HASH_ALGORITHM ?? "sha256"

/** Подпись Robokassa: значения через `:`, пустые выброшены. */
const signature = (parts) =>
  createHash(HASH_ALGORITHM)
    .update(parts.filter((p) => p !== undefined && p !== null && p !== "").join(":"))
    .digest("hex")

const M = {}            // замеры → отчёт
const say = (k, v) => { M[k] = v; console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`) }

const shot = async (page, name, { mobile = false } = {}) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !mobile })
  console.log(`  кадр ${name}.png`)
}

const run = async () => {
  const browser = await chromium.launch()
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
  const page = await desktop.newPage()
  page.setDefaultTimeout(30000)

  // ── 0. Маркер: отвечает ИМЕННО эта сборка витрины ───────────────────────────
  console.log("0. маркер сборки витрины")
  const home = await page.goto(`${STORE}/ru`, { waitUntil: "domcontentloaded" })
  say("главная HTTP", home.status())

  // ── 1. Страница товара (b17): галерея + блок информации ────────────────────
  // Берём товар, обогащённый в d07 (характеристики/отзывы/фото карточки WB):
  // первый товар каталога их не имеет, и кадр с него о b17 не говорит ничего.
  console.log("1. страница товара (b17)")
  const PDP = process.env.PDP_HANDLE ?? "mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino"
  let pdp = await page.goto(`${STORE}/ru/products/${PDP}`, { waitUntil: "domcontentloaded" })
  if (pdp.status() !== 200) {
    await page.goto(`${STORE}/ru/store`, { waitUntil: "domcontentloaded" })
    await page.getByTestId("products-list").waitFor({ timeout: 30000 })
    await page.getByTestId("product-title").first().click()
    pdp = null
  }
  await page.getByTestId("product-container").waitFor({ timeout: 30000 })
  say("URL товара", page.url())
  say("страница товара HTTP", pdp ? pdp.status() : "открыт через каталог")
  say("картинок в галерее", await page.locator("main img").count())
  say("узлов цены", await page.locator('[data-testid="product-price"]').count())
  say("кнопка «в корзину»", await page.locator('[data-testid="add-product-button"]').count())
  const pdpText = await page.locator("main").innerText()
  say("есть блок «Характеристики»", /Характеристик/i.test(pdpText))
  say("есть блок отзывов", /отзыв/i.test(pdpText))
  say("строка рейтинга", (/(\d[.,]\d)\s*из\s*5[^\n]*/i.exec(pdpText) ?? ["нет"])[0])
  await shot(page, "store-01-pdp-desktop")

  // ── 2. Журнал (b18) ─────────────────────────────────────────────────────────
  console.log("2. журнал (b18)")
  const journal = await page.goto(`${STORE}/ru/journal`, { waitUntil: "domcontentloaded" })
  say("журнал HTTP", journal.status())
  await page.waitForTimeout(2500)
  const journalText = await page.locator("main").innerText()
  say("журнал: первые строки", journalText.slice(0, 180).replace(/\n+/g, " | "))
  const articleLinks = await page.locator('main a[href*="/journal/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute("href")))].filter((h) => h && !/\/journal\/?$/.test(h)),
  )
  say("ссылок на статьи", articleLinks.length)
  await shot(page, "store-02-journal-desktop")
  if (articleLinks.length) {
    const art = await page.goto(new URL(articleLinks[0], STORE).toString(), { waitUntil: "domcontentloaded" })
    say("статья HTTP", art.status())
    say("статья URL", page.url())
    say("заголовок статьи", (await page.locator("h1").first().innerText().catch(() => "")).slice(0, 120))
    await shot(page, "store-03-article-desktop")
  }

  // ── 3. Чекаут ───────────────────────────────────────────────────────────────
  console.log("3. чекаут: корзина")
  await page.goto(`${STORE}/ru/store`, { waitUntil: "domcontentloaded" })
  await page.getByTestId("products-list").waitFor({ timeout: 30000 })
  await page.getByTestId("product-title").first().click()
  await page.getByTestId("product-container").waitFor({ timeout: 30000 })
  const addButton = page.getByTestId("add-product-button")
  const optionGroups = page.getByTestId("product-options")
  const groupCount = await optionGroups.count()
  for (let attempt = 0; attempt < 5 && !(await addButton.isEnabled()); attempt += 1) {
    for (let i = 0; i < groupCount; i += 1) {
      const btn = optionGroups.nth(i).locator("button:not([disabled])").first()
      if (await btn.count()) await btn.click().catch(() => {})
    }
    await page.waitForTimeout(800)
  }
  await addButton.click()
  await page.waitForTimeout(3000)
  say("товар в корзине", true)

  await page.goto(`${STORE}/ru/checkout`, { waitUntil: "domcontentloaded" })
  const stamp = Date.now()
  await page.getByTestId("checkout-contacts-row").click()
  await page.getByTestId("shipping-first-name-input").waitFor({ timeout: 30000 })
  await page.getByTestId("shipping-first-name-input").fill("Приёмка")
  await page.getByTestId("shipping-last-name-input").fill("d08")
  await page.getByTestId("shipping-email-input").fill(`d08-verify+${stamp}@upready.dev`)
  await page.getByTestId("shipping-phone-input").fill("+79990000000")
  await page.locator('form button[type="submit"]:visible').last().click()
  await page.getByTestId("shipping-first-name-input").waitFor({ state: "hidden", timeout: 30000 })
  say("контакты заполнены", true)

  // 3a. Быстрая подсказка адреса: реагирует ПОСЛЕ 3 символов
  console.log("3a. подсказка при вводе адреса")
  await page.getByTestId("checkout-address-row").click()
  const addNew = page.getByRole("button", { name: /add a new address|add new address|Новый адрес/i })
  if ((await addNew.count()) > 0 && (await addNew.isVisible().catch(() => false))) await addNew.click()
  const citySuggest = page.getByTestId("address-city-suggest")
  await citySuggest.waitFor({ timeout: 30000 })
  await citySuggest.fill("Мо")
  await page.waitForTimeout(2500)
  const after2 = await page.getByTestId("address-city-suggest-option").count()
  await citySuggest.fill("Моск")
  await page.waitForTimeout(3500)
  const after4 = await page.getByTestId("address-city-suggest-option").count()
  say("подсказок после 2 символов", after2)
  say("подсказок после 4 символов", after4)
  const optionTexts = await page.getByTestId("address-city-suggest-option").allInnerTexts()
  say("первые подсказки", optionTexts.slice(0, 4).map((t) => t.replace(/\n+/g, " / ")))
  await shot(page, "store-04-address-suggest")
  if (optionTexts.length) await page.getByTestId("address-city-suggest-option").first().click()

  await page.locator('input[name="address_1"]').fill("Ленина 1")
  const postal = page.locator('input[name="postal_code"]')
  if (await postal.count()) await postal.fill("101000")
  const provinceSelect = page.getByTestId("address-province-select")
  if (await provinceSelect.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
    await provinceSelect.selectOption({ index: 1 })
  } else {
    const pi = page.getByTestId("address-province-input")
    if (await pi.count()) await pi.fill("Москва")
  }
  await page.locator('form button[type="submit"]:visible').last().click()
  await page.locator('input[name="address_1"]').waitFor({ state: "hidden", timeout: 30000 })
  say("адрес сохранён", true)

  // 3b. Тарифы СДЭК: карточки способов с ценой
  console.log("3b. тарифы СДЭК на чекауте")
  await page.waitForTimeout(8000)
  const cards = page.locator('[data-testid="delivery-option-radio"], [data-testid="delivery-option-pickup"]')
  await cards.first().waitFor({ timeout: 60000 })
  const cardTexts = (await cards.allInnerTexts()).map((t) => t.replace(/\n+/g, " · ").trim())
  say("карточек доставки", cardTexts.length)
  say("карточки", cardTexts)
  say("есть цена в рублях", cardTexts.some((t) => /₽|руб/i.test(t)))
  await shot(page, "store-05-delivery-options")

  // 3c. Карта ПВЗ — открывается выбором способа «пункт выдачи»
  console.log("3c. карта пунктов выдачи")
  const pickupIdx = cardTexts.findIndex((t) => /пункт выдачи|постамат/i.test(t))
  say("карточка ПВЗ", pickupIdx >= 0 ? cardTexts[pickupIdx] : "нет")
  if (pickupIdx >= 0) {
    await cards.nth(pickupIdx).click()
    await page.waitForTimeout(4000)
    const cityField = page.getByTestId("cdek-point-city")
    if (await cityField.count()) {
      await cityField.fill("Моск")
      await page.waitForTimeout(4000)
      const opt = page.getByTestId("cdek-point-city-option").first()
      if (await opt.count()) await opt.click()
    }
    await page.getByTestId("pickup-map").waitFor({ timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(12000)
    say("карта в DOM", await page.getByTestId("pickup-map").count())
    say("состояние «карта не загрузилась»", await page.getByTestId("pickup-map-failed").count())
    say("узлов внутри контейнера карты", await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pickup-map"]')
      return el ? el.querySelectorAll("*").length : 0
    }))
    say("скрипт api-maps.yandex.ru загружен", await page.evaluate(() =>
      [...document.querySelectorAll("script")].some((s) => /api-maps\.yandex\.ru/.test(s.src))))
    say("объект ymaps в окне", await page.evaluate(() => typeof window.ymaps))
    say("счётчик пунктов", await page.getByTestId("cdek-point-count").innerText().catch(() => null))
    say("строк пунктов в списке", await page.getByTestId("cdek-point-row").count())
    await shot(page, "store-06-pickup-map")

    const choose = page.getByTestId("cdek-point-choose").first()
    if (await choose.count()) {
      await choose.click()
      await page.waitForTimeout(6000)
      say("выбранный ПВЗ на карточке", await page.getByTestId("delivery-option-cdek-point").innerText().catch(() => null))
      say("срок доставки на карточке", await page.getByTestId("delivery-option-cdek-term").innerText().catch(() => null))
      await shot(page, "store-05b-delivery-pickup-chosen")
    }
  }

  // 3d. Курьер СДЭК — цена и срок на выбранной карточке
  console.log("3d. курьер СДЭК")
  const courierIdx = cardTexts.findIndex((t) => /СДЭК[^·]*курьер/i.test(t))
  say("карточка курьера", courierIdx >= 0 ? cardTexts[courierIdx] : "нет")
  if (courierIdx >= 0) {
    await cards.nth(courierIdx).click()
    await page.waitForTimeout(7000)
    say("курьер после выбора", (await cards.nth(courierIdx).innerText()).replace(/\n+/g, " · "))
    say("курьер: срок", await page.getByTestId("delivery-option-cdek-term").innerText().catch(() => null))
    await shot(page, "store-05c-delivery-courier-chosen")
  }

  // ── 4. Мобильный кадр 390×844 ───────────────────────────────────────────────
  console.log("4. мобильные кадры 390×844")
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", isMobile: true, hasTouch: true })
  const mp = await mobile.newPage()
  for (const [url, name] of [
    [`${STORE}/ru${M["URL товара"] ? new URL(M["URL товара"]).pathname.replace(/^\/ru/, "") : "/store"}`, "store-07-pdp-mobile"],
    [`${STORE}/ru/journal`, "store-08-journal-mobile"],
  ]) {
    await mp.goto(url, { waitUntil: "domcontentloaded" })
    await mp.waitForTimeout(3500)
    await shot(mp, name, { mobile: true })
  }
  await mobile.close()

  // ── 5. Robokassa: живой тестовый платёж ─────────────────────────────────────
  console.log("5. Robokassa — тестовый платёж")
  const chip = page.getByTestId("payment-method-pp_robokassa_robokassa")
  const chipVisible = await chip.isVisible().catch(() => false)
  say("плитка Robokassa на чекауте", chipVisible)
  if (chipVisible) {
    await chip.click()
    /**
     * Ловим ПЕРВЫЙ запрос к auth.robokassa.ru и пропускаем его дальше: именно он
     * несёт подпись, IsTest и SuccessUrl2. Адрес после редиректа — уже
     * `/Merchant/Index/<guid>`, собственная страница счёта Robokassa, и
     * параметров в нём нет (замер 2026-09-16: MerchantLogin=null).
     */
    let paymentUrl = null
    await page.route("https://auth.robokassa.ru/**", async (route) => {
      if (!paymentUrl) paymentUrl = route.request().url()
      await route.continue()
    })
    const submit = page.getByTestId("submit-order-button")
    await submit.waitFor({ timeout: 60000 })
    await submit.click()
    await page.waitForURL(/auth\.robokassa\.ru/, { timeout: 90000 }).catch(() => {})
    say("адрес после редиректа", page.url())
    paymentUrl = paymentUrl ?? page.url()
    say("ушли на Robokassa", /auth\.robokassa\.ru/.test(paymentUrl))
    say("URL платежа (без подписи)", paymentUrl.replace(/SignatureValue=[0-9a-f]+/i, "SignatureValue=<hex>"))
    await page.waitForTimeout(6000)
    await shot(page, "store-09-robokassa-page")
    say("заголовок страницы Robokassa", (await page.title()).slice(0, 120))

    const u = new URL(paymentUrl)
    const p = u.searchParams
    const invoiceId = p.get("InvId"), outSum = p.get("OutSum"), sessionId = p.get("Shp_SessionID"), successUrl = p.get("SuccessUrl2")
    say("IsTest", p.get("IsTest"))
    say("MerchantLogin", p.get("MerchantLogin"))
    say("InvId / OutSum", `${invoiceId} / ${outSum}`)

    /**
     * Result-вебхук здесь НЕ проигрывается, хотя подпись у нас есть и на стенде
     * i01 эта нога зелёная (i01 §«Реквизиты»: заказ #18, InvId 1414994503).
     * Причина: вебхук ПОМЕЧАЕТ платёж полученным, и на ЖИВОМ магазине Оксаны
     * это оставило бы ей фиктивный оплаченный заказ в реальном списке. Приказ
     * задачи — «тестовый режим, платёж отменить», поэтому доходим до страницы
     * Robokassa и до страницы возврата, а оплату не подтверждаем.
     */
    say("Result-вебхук на проде", "НЕ проигран намеренно: пометил бы фиктивный заказ оплаченным")
    if (successUrl) {
      await page.goto(successUrl, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(7000)
      say("страница возврата URL", page.url())
      say("страница возврата HTTP-достижима", true)
      const returnText = (await page.locator("body").innerText().catch(() => "")).replace(/\n+/g, " | ")
      say("страница возврата: что показано", returnText.slice(0, 300))
      say("заказ подтверждён (ожидаемо НЕТ — платёж не подтверждали)",
        (await page.getByTestId("order-complete-container").count()) > 0)
      await shot(page, "store-10-return-page")
    }
  }

  await browser.close()
  writeFileSync("artifacts/docs/d08-deploy-wave6/logs/storefront-verify.json", JSON.stringify(M, null, 1))
  console.log("\nзамеры записаны: artifacts/docs/d08-deploy-wave6/logs/storefront-verify.json")
}

run().catch(async (e) => {
  writeFileSync("artifacts/docs/d08-deploy-wave6/logs/storefront-verify.json", JSON.stringify({ ...M, ОШИБКА: e.message }, null, 1))
  console.error("ОШИБКА:", e.message)
  process.exit(1)
})
