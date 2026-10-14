import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import i18n from "i18next"

import { OWNER_ROUTES, PARAM_RESOLVERS } from "../../e2e/owner-routes.mjs"
import {
  CRYPTO_NETWORKS,
  OTHER_BANK,
  REQUISITES_MAX,
  bankDraftErrors,
  bankDraftFrom,
  bankRequisite,
  compactPhone,
  contactsDraftErrors,
  contactsDraftFrom,
  contactsPayload,
  cryptoDraftErrors,
  cryptoDraftFrom,
  cryptoRequisite,
  maskAddress,
  maskBankNumber,
  offersNothing,
  putRequisite,
  telegramUsername,
} from "../lib/payment-requisites.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G3, line us-8): «Перевод по
 * реквизитам» rebuilt after the prototype (states `payments-manual`,
 * `payments-manual-empty`, `payments-manual-requisite-edit`). The card reads;
 * the switch, each requisite and the contacts are edited in their drawers;
 * the list's order and removal are in the row's «…». This package cannot
 * render JSX, so the screens are asserted on their source; the drafts, the
 * checks and the bodies of the drawers run for real, and the words against
 * ru.json.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const DIR = "routes/settings/payments"
const C = `${DIR}/components`
const page = read(`${C}/manual-payment-page.tsx`)
const card = read(`${C}/manual-payment-card.tsx`)
const stateEdit = read(`${C}/manual-payment-edit.tsx`)
const requisiteEdit = read(`${C}/manual-requisite-edit.tsx`)
const contactsEdit = read(`${C}/manual-contacts-edit.tsx`)
const MANUAL_FILES = [page, card, stateEdit, requisiteEdit, contactsEdit]

await i18n.init({
  lng: "ru",
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT("ru")

const bank = {
  id: "rq_1",
  kind: "bank",
  icon: "tbank",
  bank: "Т-Банк · карта",
  number: "4400 4302 1234 5678",
  holder: "Оксана Ч.",
}
const wallet = {
  id: "rq_2",
  kind: "crypto",
  currency: "USDT",
  network: "TRC20",
  address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
}
const noContacts = { whatsapp: null, telegram: null, email: null, note: null }

// ── Routes ──────────────────────────────────────────────────────────────────

const DRAWERS = {
  edit: "edit",
  "bank/create": "bank-create",
  "crypto/create": "crypto-create",
  "requisites/:requisiteId/edit": "requisite-edit",
  "contacts/edit": "contacts-edit",
  "pre-notice/edit": "pre-notice-edit",
}

test("the card's drawers are nested routes under the card's own address", () => {
  const start = app.indexOf('path: "manual"')
  const block = app.slice(start, app.indexOf('path: "tribute"', start))
  assert.match(block, /handle: \{ breadcrumb: \(\) => t\("paymentMethods\.ways\.manual\.title"\) \}/)
  assert.match(block, /lazy: \(\) => import\("\.\/routes\/settings\/payments\/manual"\)/)
  for (const [path, module] of Object.entries(DRAWERS)) {
    assert.match(
      block,
      new RegExp(`path: "${path}",\\s*lazy: \\(\\) => import\\("\\./routes/settings/payments/manual/${module}"\\)`),
      path
    )
  }
})

test("every new address is in the owner route manifest as an overlay, with a resolver for the requisite", async () => {
  const byPath = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  assert.notEqual(byPath.get("/settings/payments/manual")?.kind, "overlay")
  for (const path of Object.keys(DRAWERS)) {
    const manifest = `/settings/payments/manual/${path.replace(":requisiteId", ":requisite_id")}`
    assert.equal(byPath.get(manifest)?.kind, "overlay", manifest)
  }
  const api = async (path) => {
    assert.equal(path, "/tenants/payment-settings/manual")
    return { manual_payment: { requisites: [bank, wallet] } }
  }
  assert.equal(await PARAM_RESOLVERS.requisite_id(api), "rq_1")
  await assert.rejects(
    PARAM_RESOLVERS.requisite_id(async () => ({ manual_payment: { requisites: [] } })),
    /no transfer requisites/
  )
})

test("each route module hands the router its screen", () => {
  assert.match(read(`${DIR}/manual/index.ts`), /ManualPaymentPage as Component/)
  assert.match(read(`${DIR}/manual/edit.ts`), /ManualPaymentEdit as Component/)
  assert.match(read(`${DIR}/manual/contacts-edit.ts`), /ManualContactsEdit as Component/)
  assert.match(read(`${DIR}/manual/requisite-edit.ts`), /ManualRequisiteEdit as Component/)
  assert.match(read(`${DIR}/manual/bank-create.tsx`), /<ManualRequisiteEdit create="bank" \/>/)
  assert.match(read(`${DIR}/manual/crypto-create.tsx`), /<ManualRequisiteEdit create="crypto" \/>/)
  assert.match(read(`${DIR}/manual/pre-notice-edit.tsx`), /<PaymentPreNoticeEdit providerKey="manual" \/>/)
})

// ── The card ────────────────────────────────────────────────────────────────

test("the card only reads: no form, no field, no «Сохранить», no «Готово» (A1, A2)", () => {
  for (const [name, source] of [
    ["page", page],
    ["requisites", card],
  ]) {
    for (const forbidden of ["<form", "<Input", "<Switch", "<Select", "<Textarea", 'type="submit"', "actions.save"]) {
      assert.ok(!source.includes(forbidden), `${name} must not carry ${forbidden}`)
    }
  }
  for (const source of MANUAL_FILES) {
    assert.doesNotMatch(source, /manualPayment\.(apply|save|errors\.finishItem)"/)
  }
})

test("the card reads state → requisites → contacts → notice, as in the prototype (rule 17)", () => {
  const order = [
    "<SettingsDetailSection section={stateSection} level=\"h1\" />",
    "<ManualRequisitesCard record={manualPayment} />",
    "<SettingsDetailSection section={contactsSection} />",
    "<SettingsDetailSection section={preNotice.section} />",
  ]
  const at = order.map((piece) => page.indexOf(piece))
  assert.ok(at.every((index) => index > 0), `pieces: ${at}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at)
  assert.match(page, /<SingleColumnPage widgets=\{\{ before: \[\], after: \[\] \}\} hasOutlet>/)
  assert.match(page, /<SingleColumnPageSkeleton sections=\{4\} \/>/)
  assert.match(page, /editTo: "edit"/)
  assert.match(page, /editTo: "contacts\/edit"/)
})

test("a requisite row: «…» with «Изменить», «Выше» / «Ниже» and, last, «Удалить» behind a prompt (rules 8, 21)", () => {
  const groups = ["actions.change", "manualPayment.list.moveUp", "manualPayment.list.moveDown", "actions.delete"].map(
    (key) => card.indexOf(`t("${key}")`, card.indexOf("const rowActions"))
  )
  assert.ok(groups.every((index) => index > 0), `actions: ${groups}`)
  assert.deepEqual([...groups].sort((a, b) => a - b), groups)
  assert.match(card, /const editTo = \(item: PaymentRequisite\) => `requisites\/\$\{encodeURIComponent\(item\.id \?\? ""\)\}\/edit`/)
  assert.match(card, /to: editTo\(item\),/)
  // The row itself opens the drawer (rule 9); «…» sits outside the link.
  assert.ok(card.indexOf("<Link\n              to={editTo(item)}") < card.indexOf("<ActionMenu groups={rowActions(item, index)}>"))
  assert.match(card, /disabled: isSaving \|\| index === 0/)
  assert.match(card, /disabled: isSaving \|\| index === items\.length - 1/)
  // Refused before the prompt: the owner is never asked to confirm what the backend refuses.
  assert.ok(card.indexOf("keepOneRequisite") < card.indexOf("await prompt("))
  assert.match(card, /<ActionMenu groups=\{rowActions\(item, index\)\}>/)
  assert.doesNotMatch(card, /variant="danger"/)
})

test("an empty list is NoRecords with the two add buttons; the header carries them only over rows (A10)", () => {
  assert.match(card, /<NoRecords\s+title=\{t\("paymentMethods\.manual\.emptyTitle"\)\}\s+message=\{t\("paymentMethods\.manual\.emptyMessage"\)\}/)
  assert.match(card, /\{items\.length \? <AddButtons disabled=\{items\.length >= REQUISITES_MAX\} \/> : null\}/)
  assert.match(card, /<Link to=\{`\$\{kind\}\/create`\}/)
})

// ── The drawers ─────────────────────────────────────────────────────────────

test("every edit is a SettingsEditDrawer and sends only what it names", () => {
  for (const source of [stateEdit, requisiteEdit, contactsEdit]) {
    assert.ok(source.includes("<SettingsEditDrawer"))
    assert.doesNotMatch(source, /<form|variant="danger"/)
  }
  assert.match(stateEdit, /mutateAsync\(\{ enabled: draft\.enabled \}\)/)
  assert.match(contactsEdit, /mutateAsync\(\{ contacts: contactsPayload\(draft\) \}\)/)
  assert.match(requisiteEdit, /mutateAsync\(\{ requisites: putRequisite\(items, item\) \}\)/)
})

test("the bank drawer: pick the bank, its name, the number, the recipient — the name stays a field (d-2026-10-14-283)", () => {
  const order = ['name="icon"', 'name="bank"', 'name="number"', 'name="holder"'].map((piece) =>
    requisiteEdit.indexOf(piece)
  )
  assert.ok(order.every((index) => index > 0), `fields: ${order}`)
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.match(requisiteEdit, /<Select\.Item value=\{OTHER_BANK\}>\{t\("manualPayment\.bank\.other"\)\}<\/Select\.Item>/)
  assert.match(requisiteEdit, /form\.setValue\("bank", preset \? preset\.name : "", \{ shouldDirty: true \}\)/)
})

test("a gone requisite or a new one past the limit leads back to the card", () => {
  assert.match(requisiteEdit, /\(!create && !stored\) \|\| \(create && items\.length >= REQUISITES_MAX\)/)
  assert.match(requisiteEdit, /<Navigate to="\/settings\/payments\/manual" replace \/>/)
})

test("switching on or clearing the last contact with nothing to offer is said under the field", () => {
  assert.match(stateEdit, /offersNothing\(\{ \.\.\.manualPayment, enabled: draft\.enabled \}\)/)
  assert.match(stateEdit, /path: \["enabled"\], message: t\("manualPayment\.errors\.nothingToOffer"\)/)
  assert.match(contactsEdit, /offersNothing\(\{ \.\.\.manualPayment, contacts: contactsPayload\(draft\) \}\)/)
  assert.match(contactsEdit, /t\("paymentMethods\.manual\.keepOneContact"\)/)
})

// ── Drafts, checks and bodies, for real ─────────────────────────────────────

test("a bank draft: nothing picked for a new one, the preset or «Другой банк» for a stored one", () => {
  assert.deepEqual(bankDraftFrom(), { icon: "", bank: "", number: "", holder: "" })
  assert.equal(bankDraftFrom(bank).icon, "tbank")
  assert.equal(bankDraftFrom({ ...bank, icon: null }).icon, OTHER_BANK)
  assert.deepEqual(Object.values(bankDraftErrors(bankDraftFrom())).map((key) => t(key)), [
    "Выберите банк из списка или «Другой банк»",
    "Укажите название банка",
    "Номер карты, счёта или IBAN: цифры, латинские буквы, пробелы и дефисы, от 4 символов",
  ])
  assert.deepEqual(bankDraftErrors(bankDraftFrom(bank)), {})
})

test("a bank body: «Другой банк» has no icon, an empty recipient is null, the id is kept", () => {
  assert.deepEqual(
    bankRequisite({ icon: OTHER_BANK, bank: " Банк Грузии ", number: " GE29NB0000000101904917 ", holder: " " }),
    { id: undefined, kind: "bank", icon: null, bank: "Банк Грузии", number: "GE29NB0000000101904917", holder: null }
  )
  assert.deepEqual(bankRequisite(bankDraftFrom(bank), "rq_1"), bank)
})

test("a wallet: the network first, then an address of that network's own shape", () => {
  assert.deepEqual(cryptoDraftFrom(), { currency: "USDT", network: "TRC20", address: "" })
  assert.deepEqual(cryptoDraftErrors({ currency: "USDT", network: "Bitcoin", address: "x" }), {
    network: "manualPayment.errors.network",
  })
  const errors = cryptoDraftErrors({ currency: "USDT", network: "ERC20", address: wallet.address })
  assert.deepEqual(errors, { address: "manualPayment.errors.address" })
  assert.equal(
    t(errors.address, { network: "ERC20", hint: t("manualPayment.addressHint.ERC20") }),
    "Это не похоже на адрес сети ERC20: 0x и 40 символов 0–9, a–f"
  )
  assert.deepEqual(cryptoRequisite(cryptoDraftFrom(wallet), "rq_2"), wallet)
  for (const network of CRYPTO_NETWORKS) {
    assert.equal(typeof lookup(ru, `manualPayment.addressHint.${network}`), "string", network)
    assert.equal(typeof lookup(en, `manualPayment.addressHint.${network}`), "string", network)
  }
})

test("a saved requisite takes its own place; a new one goes last", () => {
  const changed = { ...bank, number: "2200 0000 0000 0001" }
  assert.deepEqual(putRequisite([bank, wallet], changed), [changed, wallet])
  const fresh = { ...wallet, id: undefined, network: "TON" }
  assert.deepEqual(putRequisite([bank, wallet], fresh), [bank, wallet, fresh])
  assert.equal(REQUISITES_MAX, 30)
})

test("contacts: the backend's shapes before the request, spaces and «@» dropped (d-2026-10-14-288)", () => {
  assert.equal(compactPhone(" +7 (999) 123-45-67 "), "+79991234567")
  assert.equal(telegramUsername("@cherkashino_shop"), "cherkashino_shop")
  assert.equal(telegramUsername("https://t.me/cherkashino_shop"), "cherkashino_shop")
  assert.deepEqual(contactsDraftFrom(), { whatsapp: "", telegram: "", email: "", note: "" })
  const bad = contactsDraftErrors({ whatsapp: "звоните", telegram: "@ab", email: "shop@", note: "" })
  assert.deepEqual(
    Object.fromEntries(Object.entries(bad).map(([field, key]) => [field, t(key)])),
    {
      whatsapp: "Номер с кодом страны, только цифры: например, +79991234567",
      telegram: "Имя пользователя Telegram: от 4 до 32 латинских букв, цифр и знаков _",
      email: "Это не похоже на адрес почты",
    }
  )
  const good = { whatsapp: "+7 999 123-45-67", telegram: "@cherkashino_shop", email: " a@b.ru ", note: " " }
  assert.deepEqual(contactsDraftErrors(good), {})
  assert.deepEqual(contactsPayload(good), {
    whatsapp: "+79991234567",
    telegram: "cherkashino_shop",
    email: "a@b.ru",
    note: null,
  })
})

test("transfers that are on need a requisite or a contact; off, anything goes", () => {
  assert.equal(offersNothing({ enabled: true, requisites: [], contacts: noContacts }), true)
  assert.equal(offersNothing({ enabled: false, requisites: [], contacts: noContacts }), false)
  assert.equal(offersNothing({ enabled: true, requisites: [bank], contacts: noContacts }), false)
  assert.equal(offersNothing({ enabled: true, requisites: [], contacts: { ...noContacts, telegram: "shop" } }), false)
  // A note alone is not a way to reach the manager.
  assert.equal(offersNothing({ enabled: true, requisites: [], contacts: { ...noContacts, note: "до 21" } }), true)
})

// ── Words ───────────────────────────────────────────────────────────────────

test("the card says the prototype's words", () => {
  assert.equal(
    t("paymentMethods.manual.intro"),
    "Покупатель оформляет заказ без оплаты на сайте, переводит деньги по реквизитам и прикладывает чек; вы подтверждаете оплату в заказе"
  )
  assert.equal(t("paymentMethods.manual.enabled"), "Принимать переводы")
  assert.equal(
    t("paymentMethods.manual.enabledHint"),
    "Заказ остаётся «ждёт оплаты», пока вы не подтвердите оплату на карточке заказа."
  )
  assert.equal(
    t("paymentMethods.manual.offHint"),
    "Добавьте хотя бы один реквизит или контакт менеджера, прежде чем включать переводы."
  )
  assert.equal(
    t("manualPayment.list.hint", { max: REQUISITES_MAX }),
    "Покупатель видит их в этом порядке и нажимает на нужный, чтобы увидеть номер. До 30 строк."
  )
  assert.equal(t("paymentMethods.manual.emptyTitle"), "Реквизитов пока нет")
  assert.equal(
    t("paymentMethods.manual.emptyMessage"),
    "Добавьте банк или криптокошелёк — покупатель увидит их на странице заказа."
  )
  assert.equal(t("manualPayment.contacts.title"), "Связаться с менеджером")
  assert.equal(t("manualPayment.bank.title"), "Банк")
  assert.equal(t("manualPayment.bank.pick"), "Выберите банк")
  assert.equal(t("paymentMethods.manual.bankHint"), "Нет в списке — «Другой банк» и название ниже")
  assert.equal(t("paymentMethods.manual.holderHint"), "Имя, как его покажет банк")
})

test("a row reads the prototype's way: the name, the masked number and the recipient", () => {
  assert.equal(
    [maskBankNumber(bank.number), t("paymentMethods.manual.recipient", { holder: bank.holder })].join(" · "),
    "•••• 5678 · получатель Оксана Ч."
  )
  assert.equal(
    `${wallet.currency} · ${t("paymentMethods.manual.network", { network: wallet.network })}`,
    "USDT · сеть TRC20"
  )
  assert.equal(maskAddress(wallet.address), "TXYZop…AeBf")
  assert.match(card, /item\.holder \? t\("paymentMethods\.manual\.recipient", \{ holder: item\.holder \}\) : null/)
})

test("every key the drawers' checks answer with is in ru.json and en.json", () => {
  const keys = new Set([
    ...Object.values(bankDraftErrors(bankDraftFrom())),
    ...Object.values(cryptoDraftErrors({ currency: "USDT", network: "x", address: "" })),
    ...Object.values(cryptoDraftErrors({ currency: "USDT", network: "TON", address: "" })),
    ...Object.values(contactsDraftErrors({ whatsapp: "x", telegram: "x", email: "x", note: "" })),
  ])
  assert.equal(keys.size, 8)
  for (const key of keys) {
    assert.equal(typeof lookup(ru, key), "string", `ru is missing ${key}`)
    assert.equal(typeof lookup(en, key), "string", `en is missing ${key}`)
  }
})
