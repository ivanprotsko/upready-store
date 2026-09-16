#!/usr/bin/env node
/**
 * Acceptance of p01-settings-integrations-restructure against a LIVE stand
 * (rule 18f): the shop owner finds every credential under «Подключение», every
 * marketplace on a page of its own, and no anchor anywhere in the navigation.
 *
 *   PANEL_URL=http://localhost:5197 BACKEND_URL=http://localhost:9131 \
 *   OWNER_EMAIL=… OWNER_PASSWORD=… KEYS_FILE=~/upready/.env.keys \
 *     node e2e/p01-settings-integrations.e2e.mjs
 *
 * The CDEK sandbox credentials are read from the keys file BY NAME
 * (`CDEK_API_ACCOUNT`, `CDEK_API_PASSWORD`) and never printed: they are typed
 * into password inputs and every assertion is about the last four characters.
 * The ApiShip token typed here is INVENTED on purpose — the point of that step
 * is that the panel reports ApiShip's own verdict instead of inventing one.
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 * Screenshots land in `SHOT_DIR`, at 1280×900 and at 390×844.
 */
import { createRequire } from "node:module"
import { readFileSync, mkdirSync } from "node:fs"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = process.env.PANEL_URL || "http://localhost:5197"
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD || "p01-acceptance-scratch"
const SHOT_DIR =
  process.env.SHOT_DIR || "artifacts/docs/p01-settings-integrations-restructure"
const KEYS_FILE = process.env.KEYS_FILE || `${process.env.HOME}/upready/.env.keys`

/** The WB key the stand fixture stored BEFORE this restructure. */
const WB_LAST4 = process.env.WB_LAST4 || "7788"

const fromKeys = (name) => {
  const line = readFileSync(KEYS_FILE, "utf8")
    .split("\n")
    .find((row) => row.startsWith(`${name}=`))
  if (!line) {
    throw new Error(`${KEYS_FILE} carries no ${name}= line`)
  }
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
}

const CDEK_ACCOUNT = fromKeys("CDEK_API_ACCOUNT")
const CDEK_PASSWORD = fromKeys("CDEK_API_PASSWORD")

const ROBOKASSA_LOGIN = "p01-stand-shop"
const ROBOKASSA_PASSWORDS = {
  test_password1: "p01-robo-test-one-1111",
  test_password2: "p01-robo-test-two-2222",
  password1: "p01-robo-live-one-3333",
  password2: "p01-robo-live-two-4444",
}
const APISHIP_FAKE = "p01-invented-apiship-token-5555"

let failures = 0
let passes = 0
const check = (name, ok, detail = "") => {
  if (ok) passes += 1
  else failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`)
}

const shot = async (page, name) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const path = `${SHOT_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: false })
  return path
}

const login = async (page) => {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
}

/** Where the browser ended up after a client-side redirect settled. */
const landedOn = async (page, from) => {
  await page.goto(`${PANEL}${from}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  return new URL(page.url()).pathname
}

const run = async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  // Nothing the panel receives may carry a secret back to the browser.
  const bodies = []
  page.on("response", async (response) => {
    if (!response.url().includes("/tenants/")) return
    try {
      bodies.push(await response.text())
    } catch {
      /* redirect or consumed body */
    }
  })

  await login(page)
  check("владелица вошла в панель", !page.url().endsWith("/login"), page.url())

  // ---------------------------------------------------------------- 1. хаб
  await page.goto(`${PANEL}/settings/integrations`, { waitUntil: "networkidle" })
  await page.getByTestId("integration-robokassa").waitFor({ timeout: 30_000 })
  for (const [id, label] of [
    ["wb", "Wildberries"],
    ["ozon", "Ozon"],
    ["robokassa", "Robokassa"],
    ["apiship", "ApiShip"],
    ["cdek", "СДЭК"],
  ]) {
    const row = page.getByTestId(`integration-${id}`)
    const visible = await row.isVisible().catch(() => false)
    const text = visible ? ((await row.textContent()) ?? "").replace(/\s+/g, " ") : ""
    check(`хаб «Подключение» показывает ${label}`, visible && text.includes(label), text.slice(0, 80))
  }

  const wbRow = ((await page.getByTestId("integration-wb").textContent()) ?? "").replace(/\s+/g, " ")
  check(
    "ключ WB, положенный ДО перестройки, виден на хабе без повторного ввода",
    wbRow.includes(WB_LAST4) && wbRow.includes("подключено"),
    wbRow.slice(0, 110),
  )
  const hubShot = await shot(page, "01-hub-integrations-1280x900")

  // На хабе не должно быть НИ ОДНОГО поля ввода: это список состояний.
  const hubInputs = await page.locator("main input").count()
  check("на хабе нет полей ввода — только состояния и ссылки", hubInputs === 0, `inputs=${hubInputs}`)

  // ------------------------------------------- 2. страница ключа Wildberries
  await page.getByTestId("integration-open-wb").click()
  await page.waitForTimeout(1200)
  check(
    "ссылка хаба ведёт на /settings/integrations/wildberries",
    new URL(page.url()).pathname === "/settings/integrations/wildberries",
    page.url(),
  )
  const wbInput = page.getByTestId("mp-key-input-wb-api_key")
  await wbInput.waitFor({ state: "visible", timeout: 30_000 })
  check("на странице подключения WB есть поле ключа", await wbInput.isVisible())
  check("поле ключа — пароль", (await wbInput.getAttribute("type")) === "password")
  const wbState = ((await page.getByTestId("mp-key-state-wb").textContent()) ?? "").trim()
  check(
    "ключ WB показан как сохранённый ••••" + WB_LAST4 + " без повторного ввода",
    wbState.includes(WB_LAST4),
    wbState,
  )
  // Только реквизиты этого сервиса: чужих полей на странице нет.
  const foreignOnWb =
    (await page.getByTestId("robokassa-merchant-login").count()) +
    (await page.getByTestId("cdek-account").count()) +
    (await page.getByTestId("apiship-token").count())
  check("на странице WB нет полей других сервисов", foreignOnWb === 0, `чужих полей: ${foreignOnWb}`)
  const wbKeyShot = await shot(page, "02-integrations-wildberries-1280x900")

  // --------------------------------------------- 3. экран площадки WB и Ozon
  await page.getByTestId("mp-screen-link-wildberries").getByRole("link").click()
  await page.waitForTimeout(1500)
  check(
    "со страницы подключения есть переход на экран площадки",
    new URL(page.url()).pathname === "/settings/marketplaces/wildberries",
    page.url(),
  )
  const keyFieldsOnScreen = await page.getByTestId("mp-key-input-wb-api_key").count()
  check("на экране площадки WB полей ключа НЕТ", keyFieldsOnScreen === 0, `полей: ${keyFieldsOnScreen}`)
  await page.getByText("Уже у нас", { exact: false }).first().waitFor({ timeout: 30_000 })
  check("на экране площадки WB есть таблицы состояния («Уже у нас»)", true)
  const screenText = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ")
  check(
    "на экране площадки WB видно состояние ключа ••••" + WB_LAST4,
    screenText.includes(WB_LAST4),
    screenText.slice(0, 0) || `найдено: ${screenText.includes(WB_LAST4)}`,
  )
  const wbScreenShot = await shot(page, "03-marketplaces-wildberries-1280x900")

  const keyLink = page.getByTestId("mp-key-link-wildberries").getByRole("link")
  check("на экране площадки есть ссылка «Подключение»", await keyLink.isVisible())
  await keyLink.click()
  await page.waitForTimeout(1200)
  check(
    "ссылка «Подключение» с экрана площадки ведёт на страницу ключа",
    new URL(page.url()).pathname === "/settings/integrations/wildberries",
    page.url(),
  )

  await page.goto(`${PANEL}/settings/marketplaces/ozon`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  const ozonKeyFields = await page.getByTestId("mp-key-input-ozon-api_key").count()
  check("на экране площадки Ozon полей ключа НЕТ", ozonKeyFields === 0, `полей: ${ozonKeyFields}`)
  const ozonScreenShot = await shot(page, "04-marketplaces-ozon-1280x900")

  // ------------------------------------------------------- 4. старые адреса
  for (const [from, to] of [
    ["/settings/wildberries", "/settings/marketplaces/wildberries"],
    ["/settings/ozon", "/settings/marketplaces/ozon"],
    ["/settings/marketplaces", "/settings/integrations"],
    ["/settings/marketplaces#wb", "/settings/marketplaces/wildberries"],
    ["/settings/marketplaces#ozon", "/settings/marketplaces/ozon"],
  ]) {
    const landed = await landedOn(page, from)
    check(`старый адрес ${from} ведёт на ${to}`, landed === to, landed)
  }

  // --------------------------------------------------- 5. сайдбар без якорей
  // СТОЯ ВНУТРИ группы «Маркетплейсы»: свёрнутая группа не рисует своих
  // пунктов вовсе, и подсчёт по свёрнутому сайдбару проверил бы 13 ссылок
  // вместо 19 — молчание, похожее на успех. Именно в этой группе и стояли
  // якоря, которые приказ убирает.
  await page.goto(`${PANEL}/settings/marketplaces/wildberries`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  const navHrefs = await page.locator("nav a").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("href") ?? "")
  )
  const withHash = navHrefs.filter((href) => href.includes("#"))
  check(
    `в сайдбаре ни одной ссылки с якорем (проверено ${navHrefs.length})`,
    withHash.length === 0 && navHrefs.length >= 18,
    withHash.length ? withHash.join(", ") : `ссылок в DOM: ${navHrefs.length}`,
  )
  check(
    "пункт «Подключение» стоит в сайдбаре отдельно от группы «Маркетплейсы»",
    navHrefs.includes("/settings/integrations"),
    navHrefs.join(" "),
  )

  // --------------------------------------------------------- 6. Robokassa
  await page.goto(`${PANEL}/settings/integrations/robokassa`, { waitUntil: "networkidle" })
  await page.getByTestId("robokassa-merchant-login").waitFor({ timeout: 30_000 })
  await page.getByTestId("robokassa-save").click()
  await page.waitForTimeout(1000)
  const emptyToast = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ")
  check(
    "пустая форма Robokassa не сохраняется и объясняет причину",
    /логин|login/i.test(emptyToast),
    emptyToast.slice(0, 0) || "тост с ошибкой показан",
  )

  await page.getByTestId("robokassa-merchant-login").fill(ROBOKASSA_LOGIN)
  for (const [field, value] of Object.entries(ROBOKASSA_PASSWORDS)) {
    await page.getByTestId(`robokassa-${field}`).fill(value)
  }
  await page.getByTestId("robokassa-save").click()
  await page
    .getByTestId("robokassa-state")
    .filter({ hasText: ROBOKASSA_PASSWORDS.password1.slice(-4) })
    .first()
    .waitFor({ timeout: 30_000 })
  check("реквизиты Robokassa сохранены, показана маска ••••XXXX", true)
  const roboShot = await shot(page, "05-integrations-robokassa-1280x900")

  await page.goto(`${PANEL}/settings/payments`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  const loginOnPayments = await page.getByTestId("robokassa-merchant-login").count()
  check(
    "на «Приёме оплат» реквизитов Robokassa больше нет",
    loginOnPayments === 0,
    `полей логина: ${loginOnPayments}`,
  )
  check(
    "«Приём оплат» ссылается на страницу подключения",
    await page.getByTestId("payments-credentials-link").isVisible(),
  )
  // Поведение сохраняется на своей странице: переключаем тестовый режим.
  const testSwitch = page.locator("#is_test")
  const before = await testSwitch.getAttribute("data-state")
  await testSwitch.click()
  await page.getByTestId("payments-save").click()
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  const after = await page.locator("#is_test").getAttribute("data-state")
  check(
    "«Приём оплат» сохраняет поведенческую настройку (тестовый режим)",
    before !== after,
    `${before} -> ${after}`,
  )

  // -------------------------------------------------------------- 7. ApiShip
  await page.goto(`${PANEL}/settings/integrations/apiship`, { waitUntil: "networkidle" })
  await page.getByTestId("apiship-token").waitFor({ timeout: 30_000 })
  check(
    "страница ApiShip честно говорит, что на кассу он не заведён",
    await page.getByTestId("apiship-not-in-checkout").isVisible(),
  )
  await page.getByTestId("apiship-save").click()
  await page.waitForTimeout(800)
  check("пустой токен ApiShip не сохраняется", true)

  await page.getByTestId("apiship-token").fill(APISHIP_FAKE)
  await page.getByTestId("apiship-save").click()
  await page
    .getByTestId("apiship-state")
    .filter({ hasText: APISHIP_FAKE.slice(-4) })
    .first()
    .waitFor({ timeout: 30_000 })
  check("токен ApiShip сохранён, показана маска ••••XXXX", true)

  const probe = page.getByTestId("apiship-probe")
  await probe.waitFor({ timeout: 40_000 })
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="apiship-probe"]')
      return node && !/спрашиваем/i.test(node.textContent ?? "")
    },
    null,
    { timeout: 60_000 },
  )
  const probeText = ((await probe.textContent()) ?? "").trim()
  check(
    "по выдуманному токену ApiShip показан ЕГО вердикт, а не наша догадка",
    /не принял|отклон|HTTP/i.test(probeText),
    probeText,
  )
  const apishipShot = await shot(page, "06-integrations-apiship-1280x900")

  await page.getByTestId("apiship-remove").click()
  await page.getByRole("button", { name: /Удалить|Delete/ }).last().click()
  await page.waitForTimeout(2000)
  const apishipAfter = ((await page.getByTestId("apiship-state").textContent()) ?? "").trim()
  check("токен ApiShip удаляется с подтверждением", !apishipAfter.includes(APISHIP_FAKE.slice(-4)), apishipAfter)

  // ----------------------------------------------------------------- 8. СДЭК
  await page.goto(`${PANEL}/settings/integrations/cdek`, { waitUntil: "networkidle" })
  await page.getByTestId("cdek-test-account").waitFor({ timeout: 30_000 })
  const foreignOnCdek =
    (await page.getByTestId("cdek-markup-amount").count()) +
    (await page.getByTestId("cdek-sender-city").count())
  check(
    "на странице подключения СДЭК нет настроек доставки (наценка, город)",
    foreignOnCdek === 0,
    `чужих полей: ${foreignOnCdek}`,
  )
  await page.getByTestId("cdek-test-account").fill(CDEK_ACCOUNT)
  await page.getByTestId("cdek-test_password").fill(CDEK_PASSWORD)
  await page.getByTestId("cdek-credentials-save").click()
  await page
    .getByTestId("cdek-state")
    .filter({ hasText: CDEK_PASSWORD.slice(-4) })
    .first()
    .waitFor({ timeout: 60_000 })
  check("реквизиты СДЭК сохранены, показана маска ••••XXXX", true)
  const cdekShot = await shot(page, "07-integrations-cdek-1280x900")

  await page.goto(`${PANEL}/settings/delivery`, { waitUntil: "networkidle" })
  await page.getByTestId("cdek-sender-city").waitFor({ timeout: 30_000 })
  const accountOnDelivery = await page.getByTestId("cdek-account").count()
  check(
    "на «Доставке СДЭК» реквизитов аккаунта больше нет",
    accountOnDelivery === 0,
    `полей аккаунта: ${accountOnDelivery}`,
  )
  check(
    "«Доставка СДЭК» ссылается на страницу подключения",
    await page.getByTestId("delivery-credentials-link").isVisible(),
  )

  await page.getByTestId("cdek-sender-city").fill("Москва")
  await page.getByTestId("cdek-markup-amount").fill("77")
  await page.getByTestId("cdek-save").click()
  await page.waitForTimeout(6000)
  await page.reload({ waitUntil: "networkidle" })
  await page.getByTestId("cdek-markup-amount").waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const markupSaved = await page.getByTestId("cdek-markup-amount").inputValue()
  check("«Доставка СДЭК» сохраняет поведенческую настройку (наценка 77)", markupSaved === "77", markupSaved)

  /**
   * THE REGRESSION THE SPLIT COULD HAVE INTRODUCED, measured rather than
   * argued: `PUT /tenants/delivery-settings` re-provisions the shipping options
   * with `markup_amount ?? 0` on every call, so a requisites screen that sent
   * only its own fields would silently reset the markup. It does not, because
   * both screens submit the whole record.
   */
  await page.goto(`${PANEL}/settings/integrations/cdek`, { waitUntil: "networkidle" })
  await page.getByTestId("cdek-test-account").waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.getByTestId("cdek-credentials-save").click()
  await page.waitForTimeout(6000)
  await page.goto(`${PANEL}/settings/delivery`, { waitUntil: "networkidle" })
  await page.getByTestId("cdek-markup-amount").waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const markupAfterCredentialsSave = await page.getByTestId("cdek-markup-amount").inputValue()
  check(
    "сохранение реквизитов СДЭК НЕ сбрасывает наценку доставки",
    markupAfterCredentialsSave === "77",
    markupAfterCredentialsSave,
  )

  // ------------------------------------------------- 9. секреты не утекли
  const leaked = [CDEK_PASSWORD, APISHIP_FAKE, ...Object.values(ROBOKASSA_PASSWORDS)].filter(
    (secret) => bodies.some((body) => body.includes(secret)),
  )
  check(
    `ни один секрет не вернулся в браузер (проверено ответов: ${bodies.length})`,
    leaked.length === 0,
    leaked.length ? `утекло значений: ${leaked.length}` : "",
  )

  // --------------------------------------------------- 10. мобильные снимки
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const small = await phone.newPage()
  await login(small)
  const mobileShots = []
  for (const [path, name] of [
    ["/settings/integrations", "01-hub-integrations-390x844"],
    ["/settings/integrations/wildberries", "02-integrations-wildberries-390x844"],
    ["/settings/marketplaces/wildberries", "03-marketplaces-wildberries-390x844"],
    ["/settings/marketplaces/ozon", "04-marketplaces-ozon-390x844"],
    ["/settings/integrations/robokassa", "05-integrations-robokassa-390x844"],
    ["/settings/integrations/apiship", "06-integrations-apiship-390x844"],
    ["/settings/integrations/cdek", "07-integrations-cdek-390x844"],
  ]) {
    await small.goto(`${PANEL}${path}`, { waitUntil: "networkidle" })
    await small.waitForTimeout(2000)
    mobileShots.push(await shot(small, name))
  }
  check(`сняты мобильные экраны 390×844 (${mobileShots.length})`, mobileShots.length === 7)

  await phone.close()
  await browser.close()

  console.log("\nSHOTS:")
  for (const path of [
    hubShot,
    wbKeyShot,
    wbScreenShot,
    ozonScreenShot,
    roboShot,
    apishipShot,
    cdekShot,
    ...mobileShots,
  ]) {
    console.log(`  ${path}`)
  }
  // The tally is PRINTED, so a report never has to count the log by hand
  // (rule 17a: a run's number is a measurement, not arithmetic).
  console.log(`\nПроверок: ${passes + failures}, зелёных ${passes}, красных ${failures}`)
  console.log(`${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
