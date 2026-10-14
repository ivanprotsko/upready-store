import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import i18n from "i18next"

import { OWNER_ROUTES } from "../../e2e/owner-routes.mjs"
import {
  EMPTY_PRE_NOTICE_ENTRY,
  prePaymentNoticeShownWhen,
  prePaymentNoticeText,
} from "../lib/payment-pre-notice.ts"
import {
  PAYMENT_WAYS,
  WAY_STATE_COLOR,
  manualState,
  offeredWays,
  robokassaMethodLabel,
  robokassaState,
  storedState,
  visibleWays,
  x402State,
} from "../routes/settings/payments/payment-ways.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G3 «Оплата»): `/settings/payments`
 * rebuilt after the prototype. The screen is a list of the payment methods,
 * each row opening the method's card; Robokassa, Tribute, BTCPay, Bitcart and
 * x402 read on `SettingsDetail` and edit in `SettingsEditDrawer`; «Уведомление
 * перед оплатой» is one shared drawer under every card that carries it. This
 * package cannot render JSX (see `settings-detail-edit-drawer.test.mjs`), so
 * the screens are asserted on their source; the states, the list and the
 * buyer's notice run for real against ru.json.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)
const keysOf = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  )

const DIR = "routes/settings/payments"
const C = `${DIR}/components`
const FILES = [
  `${DIR}/payments.tsx`,
  `${DIR}/payment-ways.ts`,
  `${DIR}/mode-needs-passwords-key.ts`,
  `${C}/address-value.tsx`,
  `${C}/method-text-field.tsx`,
  `${C}/payment-pre-notice-card.tsx`,
  `${C}/payment-pre-notice-edit.tsx`,
  `${C}/robokassa-card.tsx`,
  `${C}/robokassa-edit.tsx`,
  `${C}/robokassa-behaviour-fields.tsx`,
  `${C}/robokassa-method-switches.tsx`,
  `${C}/tribute-card.tsx`,
  `${C}/tribute-edit.tsx`,
  `${C}/btcpay-card.tsx`,
  `${C}/btcpay-edit.tsx`,
  `${C}/bitcart-card.tsx`,
  `${C}/bitcart-edit.tsx`,
  `${C}/x402-card.tsx`,
  `${C}/x402-edit.tsx`,
  `${C}/manual-payment-page.tsx`,
  "lib/payment-pre-notice.ts",
]
const CARDS = ["robokassa", "tribute", "btcpay", "bitcart", "x402"]
const PRE_NOTICE_WAYS = ["robokassa", "manual", "tribute", "btcpay", "bitcart"]

const list = read(`${DIR}/payments.tsx`)
const card = (way) => read(`${C}/${way}-card.tsx`)
const edit = (way) => read(`${C}/${way}-edit.tsx`)
const preNoticeEdit = read(`${C}/payment-pre-notice-edit.tsx`)
const preNoticeSection = read(`${C}/payment-pre-notice-card.tsx`)

const plain = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

await i18n.init({
  lng: "ru",
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT("ru")

const methods = (patch = {}) => ({
  robokassa: false,
  tribute: false,
  btcpay: false,
  bitcart: false,
  x402: false,
  manualCrypto: false,
  manualManager: false,
  demo: false,
  ...patch,
})

// ── Routes ──────────────────────────────────────────────────────────────────

test("the list, a card per method and their drawers are nested routes of /settings/payments", () => {
  const block = app.slice(app.indexOf('path: "/settings/payments"'), app.indexOf('path: "/settings/delivery"'))
  assert.match(block, /handle: \{ breadcrumb: \(\) => t\("app\.nav\.owner\.payments"\) \}/)
  assert.match(block, /path: "",\s*lazy: \(\) => import\("\.\/routes\/settings\/payments"\)/)
  for (const way of ["robokassa", "manual", ...CARDS.slice(1)]) {
    assert.match(
      block,
      new RegExp(`path: "${way}",\\s*handle: \\{ breadcrumb: \\(\\) => t\\("paymentMethods\\.ways\\.${way}\\.title"\\) \\}`),
      `${way} has its card with a crumb from the catalog`
    )
  }
  for (const way of CARDS) {
    assert.ok(block.includes(`import("./routes/settings/payments/${way}/edit")`), `${way} has its edit drawer`)
  }
  for (const way of PRE_NOTICE_WAYS) {
    assert.ok(
      block.includes(`import("./routes/settings/payments/${way}/pre-notice-edit")`),
      `${way} hangs the shared pre-notice drawer`
    )
  }
  assert.ok(!block.includes("x402/pre-notice-edit"), "the platform keeps no notice for x402")
})

test("every new address is in the owner route manifest, drawers as overlays", () => {
  const byPath = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  assert.equal(byPath.get("/settings/payments")?.core, true)
  for (const way of ["robokassa", "manual", ...CARDS.slice(1)]) {
    assert.ok(byPath.has(`/settings/payments/${way}`), `${way} card`)
    assert.notEqual(byPath.get(`/settings/payments/${way}`).kind, "overlay")
  }
  for (const way of CARDS) {
    assert.equal(byPath.get(`/settings/payments/${way}/edit`)?.kind, "overlay", `${way}/edit`)
  }
  for (const way of PRE_NOTICE_WAYS) {
    assert.equal(byPath.get(`/settings/payments/${way}/pre-notice/edit`)?.kind, "overlay", `${way}/pre-notice/edit`)
  }
})

test("each route module hands the router its screen", () => {
  for (const way of CARDS) {
    assert.match(read(`${DIR}/${way}/index.ts`), /as Component \} from "\.\.\/components\/[\w-]+-card"/)
    assert.match(read(`${DIR}/${way}/edit.ts`), /as Component \} from "\.\.\/components\/[\w-]+-edit"/)
  }
  for (const way of PRE_NOTICE_WAYS) {
    assert.ok(
      read(`${DIR}/${way}/pre-notice-edit.tsx`).includes(`<PaymentPreNoticeEdit providerKey="${way}" />`),
      `${way}'s drawer is fixed to its own method`
    )
  }
})

test("the first tab reads «Способы оплаты», the second stays as it is (line us-10's screen)", () => {
  assert.equal(ru.app.nav.owner.tabs.paymentsMode, "Способы оплаты")
  assert.equal(en.app.nav.owner.tabs.paymentsMode, "Payment methods")
  assert.equal(ru.app.nav.owner.tabs.paymentsAccount, "Счёт Robokassa")
})

// ── The list ────────────────────────────────────────────────────────────────

test("the list only reads: no form, no field, no «Сохранить» (A1, A2)", () => {
  for (const forbidden of ["<form", "<Input", "<Switch", "<Select", "actions.save", 'type="submit"', "Card />"]) {
    assert.ok(!list.includes(forbidden), `the list must not carry ${forbidden}`)
  }
})

test("each row is a link to its card with the method's StatusBadge; the header counts the checkout's methods", () => {
  assert.match(list, /to=\{`\/settings\/payments\/\$\{way\}`\}/)
  assert.match(list, /<StatusBadge className="shrink-0" color=\{WAY_STATE_COLOR\[states\[way\]\]\}>/)
  assert.match(list, /t\("paymentMethods\.list\.atCheckout", \{ count: offered\.length \}\)/)
  assert.match(list, /<SingleColumnPageSkeleton/)
})

test("the rows: Tribute where offered, the crypto methods where the instance takes them", () => {
  assert.deepEqual(PAYMENT_WAYS, ["robokassa", "manual", "tribute", "btcpay", "bitcart", "x402"])
  assert.deepEqual(visibleWays({ tributeAvailable: false, cryptoAvailable: false }), ["robokassa", "manual"])
  assert.deepEqual(visibleWays({ tributeAvailable: true, cryptoAvailable: false }), ["robokassa", "manual", "tribute"])
  assert.deepEqual(visibleWays({ tributeAvailable: false, cryptoAvailable: true }), [
    "robokassa",
    "manual",
    "btcpay",
    "bitcart",
    "x402",
  ])
})

test("«на кассе» is the platform's own answer, the transfer on if either half is", () => {
  const all = visibleWays({ tributeAvailable: true, cryptoAvailable: true })
  assert.deepEqual(offeredWays(methods({ robokassa: true, tribute: true, manualManager: true }), all), [
    "robokassa",
    "manual",
    "tribute",
  ])
  assert.deepEqual(offeredWays(methods({ manualCrypto: true, x402: true }), all), ["manual", "x402"])
  // An instance without crypto hides the row even if an old switch is still on.
  assert.deepEqual(offeredWays(methods({ btcpay: true }), ["robokassa", "manual"]), [])
  assert.deepEqual(offeredWays(methods({ demo: true }), all), [])
})

test("the prototype's header phrase, word for word", () => {
  const offered = ["robokassa", "manual", "tribute"]
  const phrase = `${t("paymentMethods.list.description")} ${t("paymentMethods.list.buyerSees", {
    methods: offered.map((way) => t(`paymentMethods.ways.${way}.title`)).join(t("paymentSettings.methodsSummary.listSeparator")),
  })}`
  assert.equal(
    phrase,
    "Как покупатель может заплатить на кассе. Покупателю сейчас доступны: Robokassa, Перевод по реквизитам, Tribute."
  )
  assert.equal(t("paymentMethods.list.atCheckout", { count: 3 }), "3 на кассе")
})

// ── States (design-system rule 17) ──────────────────────────────────────────

test("each state has its word and colour: green on and test mode, grey off and unset, orange test network, red unreadable", () => {
  assert.equal(robokassaState({ is_enabled: true, is_test: true }), "test")
  assert.equal(robokassaState({ is_enabled: true, is_test: false }), "connected")
  assert.equal(robokassaState({ is_enabled: false, is_test: true }), "off")
  assert.equal(robokassaState(null), "none")
  assert.equal(robokassaState(null, { id: "x" }), "unreadable")
  assert.equal(storedState({ is_enabled: true }), "connected")
  assert.equal(storedState({ is_enabled: false }), "off")
  assert.equal(storedState(null), "none")
  assert.equal(storedState(null, { id: "x" }), "unreadable")
  assert.equal(x402State({ is_enabled: true, is_test: true }), "testnet")
  assert.equal(x402State({ is_enabled: true, is_test: false }), "connected")
  assert.equal(manualState(methods({ manualCrypto: true })), "connected")
  assert.equal(manualState(methods()), "off")

  assert.deepEqual(WAY_STATE_COLOR, {
    connected: "green",
    test: "green",
    testnet: "orange",
    off: "grey",
    none: "grey",
    unreadable: "red",
  })
  assert.deepEqual(
    Object.fromEntries(Object.keys(WAY_STATE_COLOR).map((state) => [state, t(`paymentMethods.state.${state}`)])),
    {
      connected: "подключено",
      test: "тестовый режим",
      testnet: "тестовая сеть",
      off: "выключено",
      none: "не настроено",
      unreadable: "ключ не читается",
    }
  )
})

test("Robokassa's methods are named in the panel's words, others by Robokassa's own name", () => {
  assert.equal(robokassaMethodLabel(t, { alias: "SBP", name_ru: "Банковская карта", name_en: null }, "ru"), "СБП")
  assert.equal(robokassaMethodLabel(t, { alias: "Mir", name_ru: "Мир", name_en: "Mir" }, "ru"), "Мир")
  assert.equal(robokassaMethodLabel(t, { alias: "Odd", name_ru: null, name_en: null }, "en"), "Odd")
})

// ── The cards ───────────────────────────────────────────────────────────────

test("every card only reads on SettingsDetail, every edit is a SettingsEditDrawer (E2, E3, rule 1)", () => {
  for (const way of CARDS) {
    const source = card(way)
    assert.ok(source.includes("<SettingsDetail"), `${way} card reads on SettingsDetail`)
    for (const forbidden of ["<form", "<Input", "<Switch", "<Select", "<Checkbox", 'type="submit"']) {
      assert.ok(!source.includes(forbidden), `${way} card must not carry ${forbidden}`)
    }
    assert.ok(edit(way).includes("<SettingsEditDrawer"), `${way} edit is a SettingsEditDrawer`)
  }
  assert.ok(preNoticeEdit.includes("<SettingsEditDrawer"))
})

test("cards read state → requisites → notice, and service addresses copy (rule 17)", () => {
  assert.match(card("tribute"), /sections=\{\[stateSection, requisitesSection, preNotice\.section\]\}/)
  assert.match(card("btcpay"), /sections=\{\[stateSection, requisitesSection, preNotice\.section\]\}/)
  assert.match(card("x402"), /sections=\{\[stateSection, requisitesSection\]\}/)
  assert.match(
    card("robokassa"),
    /stateSection,\s*behaviourSection,\s*\.\.\.\(preNotice\.isSet \? \[preNotice\.section\] : \[\]\),\s*resultUrlSection,/
  )
  assert.match(card("robokassa"), /<AddressValue value=\{resultUrl\}/)
  assert.match(card("btcpay"), /<AddressValue value=\{btcpay\.webhook_url\}/)
  assert.match(card("x402"), /<AddressValue value=\{x402\.agent_purchase_url\}/)
  assert.match(read(`${C}/address-value.tsx`), /<Copy content=\{value\} asChild>/)
})

test("Robokassa's card links to its login and passwords instead of a second copy of them", () => {
  const source = card("robokassa")
  assert.match(source, /const ACCOUNT_PAGE = "\/settings\/integrations\/robokassa"/)
  assert.doesNotMatch(source, /password1\.last4|merchant_login/)
  // Without a readable account nothing can be saved: no «Изменить» on the behaviour.
  assert.match(source, /actions: account \? undefined : \[\]/)
})

test("the Robokassa drawer: «Принимать оплату» first, «Алгоритм подписи» last (A4), the whole record, no password", () => {
  const fields = read(`${C}/robokassa-behaviour-fields.tsx`)
  const order = ['name="is_enabled"', 'name="is_test"', "<RobokassaMethodSwitches", 'name="fiscalization_enabled"', 'name="hash_algorithm"']
  const at = order.map((needle) => fields.indexOf(needle))
  assert.ok(at.every((index) => index > 0), `all fields present: ${at}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the prototype's order")

  const drawer = edit("robokassa")
  assert.match(drawer, /mutateAsync\(\{ provider: "robokassa", merchant_login: account\.merchant_login, \.\.\.values \}\)/)
  assert.doesNotMatch(drawer, /password1:|password2:/)
  assert.match(drawer, /successMessage=\{t\("paymentSettings\.saved"\)\}/)
  assert.equal(ru.paymentSettings.saved, "Настройки оплаты сохранены")
})

test("the last Robokassa method still on cannot be switched off", () => {
  const switches = read(`${C}/robokassa-method-switches.tsx`)
  assert.match(switches, /disabled=\{on && onCount <= 1\}/)
  assert.match(switches, /name="disabled_methods"/)
})

test("the requisites drawers keep the old checks, shown next to the field in the panel's words", () => {
  for (const [way, fn] of [
    ["tribute", "tributeDraftErrors(draft, settings)"],
    ["btcpay", "btcpayDraftErrors(draft, settings)"],
    ["bitcart", "bitcartDraftErrors(draft, settings)"],
    ["x402", "x402DraftErrors(draft)"],
  ]) {
    const source = edit(way)
    assert.ok(source.includes(fn), `${way} runs ${fn}`)
    assert.ok(
      source.includes('ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })'),
      `${way} puts each error on its field, translated`
    )
  }
})

test("a method the instance does not offer leads back to the list from its own address", () => {
  for (const way of ["tribute", "btcpay", "bitcart", "x402"]) {
    assert.ok(card(way).includes('<Navigate to="/settings/payments" replace />'), way)
  }
})

// ── «Уведомление перед оплатой» ─────────────────────────────────────────────

test("the notice is a section of the card with one shared drawer; no «Способ оплаты» select, no «Иностранная карта»", () => {
  assert.match(preNoticeSection, /editTo: "pre-notice\/edit"/)
  assert.doesNotMatch(preNoticeEdit, /paymentPreNotice\.method"/)
  assert.match(preNoticeEdit, /provider_key: providerKey/)
  for (const source of FILES.map(read)) {
    assert.doesNotMatch(source, /providerKey="card"|usePreNoticeSection\("card"\)/)
  }
  assert.doesNotMatch(card("x402"), /usePreNoticeSection/)
})

test("the buyer's text is the prototype's, from the stored fields, for a rouble cart", () => {
  const tribute = {
    ...EMPTY_PRE_NOTICE_ENTRY,
    charge_currency_code: "usd",
    redirect_kind: "telegram_bot",
    redirect_value: "@cherkashino_pay_bot",
    rate_source: "ЦБ РФ",
    refund_terms: "в течение 14 дней по запросу в Telegram",
  }
  assert.equal(
    prePaymentNoticeText(tribute, t),
    "Для оплаты вы перейдёте в Telegram-бот @cherkashino_pay_bot. Сумма будет списана в USD по курсу ЦБ РФ на момент оплаты. Возврат: в течение 14 дней по запросу в Telegram."
  )
  assert.equal(prePaymentNoticeShownWhen(tribute), "always")
})

test("no notice, a rouble-only notice and a foreign card alone each read honestly (A6: no key on screen)", () => {
  assert.equal(prePaymentNoticeText(EMPTY_PRE_NOTICE_ENTRY, t), null)
  assert.equal(prePaymentNoticeShownWhen(EMPTY_PRE_NOTICE_ENTRY), "never")

  const usdOnly = { ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "usd" }
  assert.equal(prePaymentNoticeText(usdOnly, t), "Сумма будет списана в USD.")
  assert.equal(prePaymentNoticeShownWhen(usdOnly), "currency")

  const rubOnly = { ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "rub" }
  assert.equal(prePaymentNoticeText(rubOnly, t), null)
  assert.equal(prePaymentNoticeShownWhen(rubOnly), "currency")

  const foreign = { ...EMPTY_PRE_NOTICE_ENTRY, is_foreign_card: true }
  assert.equal(prePaymentNoticeText(foreign, t), "")
  assert.equal(prePaymentNoticeShownWhen(foreign), "always")

  const noValue = { ...EMPTY_PRE_NOTICE_ENTRY, redirect_kind: "domain", redirect_value: " " }
  const text = prePaymentNoticeText(noValue, t)
  assert.equal(text, "Для оплаты вы перейдёте на ….")
  assert.doesNotMatch(text, /paymentPreNotice|valuePlaceholder/)
})

test("Robokassa carries the section only while its stored notice says something", () => {
  assert.match(preNoticeSection, /isSet: when !== "never"/)
  assert.match(card("robokassa"), /usePreNoticeSection\("robokassa"\)/)
})

test("«Перевод по реквизитам» keeps today's card on its own address, plus its notice", () => {
  const page = read(`${C}/manual-payment-page.tsx`)
  assert.match(page, /<ManualPaymentCard \/>/)
  assert.match(page, /usePreNoticeSection\("manual"\)/)
  assert.match(page, /hasOutlet/)
})

// ── Words ───────────────────────────────────────────────────────────────────

test("every key the G3 files ask for is in ru.json and en.json", () => {
  const asked = new Set()
  for (const file of FILES) {
    for (const match of read(file).matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      asked.add(match[1])
    }
  }
  for (const way of PAYMENT_WAYS) {
    asked.add(`paymentMethods.ways.${way}.title`)
    asked.add(`paymentMethods.ways.${way}.description`)
  }
  for (const kind of ["domain", "telegram_bot", "crypto_network", "bank"]) {
    asked.add(`paymentMethods.preNotice.redirectValue.${kind}.label`)
    asked.add(`paymentMethods.preNotice.redirectValue.${kind}.placeholder`)
  }
  assert.ok(asked.size > 80, `asked ${asked.size}`)
  for (const key of asked) {
    assert.equal(typeof lookup(ru, key), "string", `ru is missing ${key}`)
    assert.equal(typeof lookup(en, key), "string", `en is missing ${key}`)
  }
})

test("the new block is key for key in both languages, and translated", () => {
  assert.deepEqual(keysOf(en.paymentMethods).sort(), keysOf(ru.paymentMethods).sort())
  assert.notEqual(ru.paymentMethods.list.title, en.paymentMethods.list.title)
})

test("no Russian literal outside comments in the G3 files (panel-ds rule 7), no English default fallbacks", () => {
  for (const file of FILES) {
    const code = plain(read(file))
    const russian = code.split("\n").filter((line) => /[А-Яа-яЁё]/.test(line))
    assert.deepEqual(russian, [], `${file} carries a Russian literal`)
    assert.doesNotMatch(code, /defaultValue:/, `${file} carries a default fallback`)
  }
})

test("nothing dangerous sits next to «Сохранить»: no danger button anywhere in G3", () => {
  for (const file of FILES) {
    assert.doesNotMatch(read(file), /variant="danger"/, file)
  }
})
