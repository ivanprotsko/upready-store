import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  cdekNumberToShow,
  cdekPdfFilename,
  cdekPrintErrorText,
  cdekPrintPath,
  cdekTrackingUrl,
  isCdekPrintable,
  openPdfTab,
} from "../lib/cdek-print.ts"

/**
 * «Наклейка СДЭК» and «Квитанция СДЭК» in the order's fulfillment card
 * (t-2026-10-14-58, part A). `cdek-print.ts` is plain TS with no JSX, so it is
 * imported and run for real; the card and the catalogs are read as source.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

const registered = {
  provider_id: "cdek_cdek",
  canceled_at: null,
  data: { provider: "cdek", tenant_id: "ten_1", cdek_order_uuid: "72753031-1111-2222-3333-444455556666" },
  labels: [],
}

test("only a CDEK fulfillment registered in CDEK and not cancelled can print", () => {
  assert.equal(isCdekPrintable(registered), true)
  assert.equal(isCdekPrintable({ ...registered, provider_id: "manual_manual" }), false)
  assert.equal(isCdekPrintable({ ...registered, data: { provider: "cdek" } }), false)
  assert.equal(isCdekPrintable({ ...registered, data: null }), false)
  assert.equal(isCdekPrintable({ ...registered, canceled_at: "2026-10-14T05:00:00Z" }), false)
})

test("CDEK's number is shown once, as a link to CDEK's tracking page", () => {
  const withNumber = { ...registered, data: { ...registered.data, cdek_number: "1234567890" } }
  assert.equal(cdekNumberToShow(withNumber), "1234567890")
  assert.equal(cdekNumberToShow(registered), null)
  assert.equal(
    cdekNumberToShow({ ...withNumber, labels: [{ tracking_number: "1234567890" }] }),
    null,
    "a number the owner already typed as the tracking label is not repeated"
  )
  assert.equal(cdekNumberToShow({ ...withNumber, provider_id: "manual_manual" }), null)
  assert.equal(cdekTrackingUrl("1234567890"), "https://www.cdek.ru/ru/tracking?order_id=1234567890")
})

test("the PDF is read from the tenant route, named after the order", () => {
  assert.equal(
    cdekPrintPath("order_1", "ful_1", "label"),
    "/tenants/orders/order_1/fulfillments/ful_1/cdek/label"
  )
  assert.equal(
    cdekPrintPath("order_1", "ful_1", "waybill"),
    "/tenants/orders/order_1/fulfillments/ful_1/cdek/waybill"
  )
  assert.equal(cdekPdfFilename("label", 101), "cdek-label-101.pdf")
  assert.equal(cdekPdfFilename("waybill", 101), "cdek-receipt-101.pdf")
})

test("each refusal gets its own toast, chosen by status", () => {
  assert.deepEqual(cdekPrintErrorText({ status: 409, message: "x" }), {
    key: "orders.fulfillment.cdek.errors.notRegistered",
  })
  assert.deepEqual(cdekPrintErrorText({ status: 504, message: "x" }), {
    key: "orders.fulfillment.cdek.errors.timeout",
  })
  assert.deepEqual(cdekPrintErrorText({ status: 502, message: "v2_entity_not_found" }), {
    key: "orders.fulfillment.cdek.errors.failed",
    values: { message: "v2_entity_not_found" },
  })
  assert.deepEqual(cdekPrintErrorText({ status: 422, message: "Это отправление не через СДЭК" }), {
    message: "Это отправление не через СДЭК",
  })
})

test("the tab is opened in the click and says the file is coming", () => {
  const tab = { location: { href: "" }, close() {}, opener: {}, document: { title: "", body: { textContent: "" } } }
  const calls = []
  const opened = openPdfTab("Готовим файл СДЭК…", (url, target) => {
    calls.push([url, target])
    return tab
  })
  assert.equal(opened, tab)
  assert.deepEqual(calls, [["", "_blank"]])
  assert.equal(tab.opener, null)
  assert.equal(tab.document.body.textContent, "Готовим файл СДЭК…")
  assert.equal(openPdfTab("…", () => null), null, "a blocked tab falls back to saving the file")
})

test("the card offers both actions in its «…» menu, only when CDEK can print", () => {
  const card = read(
    "../routes/orders/order-detail/components/order-fulfillment-section/order-fulfillment-section.tsx"
  )
  assert.match(card, /actions: cdekPrintable\s*\?/)
  assert.match(card, /t\("orders\.fulfillment\.cdek\.label"\)[\s\S]*?onClick: \(\) => handleCdekPrint\("label"\)/)
  assert.match(card, /t\("orders\.fulfillment\.cdek\.waybill"\)[\s\S]*?onClick: \(\) => handleCdekPrint\("waybill"\)/)
  assert.match(card, /<ActionMenu[\s\S]*?orders\.fulfillment\.cdek\.label[\s\S]*?actions\.cancel/)
  assert.match(card, /href=\{cdekTrackingUrl\(cdekNumber\)\}/)
  // The tab is opened before the fetch is awaited, inside the click.
  assert.match(card, /const tab = openPdfTab\([^)]*\)\)\s*\n\s*\n\s*try \{\s*\n\s*const blob = await fetchCdekPdf\(kind\)/)
})

test("both catalogs carry the CDEK strings, the Russian ones word for word", () => {
  const ru = JSON.parse(read("../i18n/translations/ru.json")).orders.fulfillment.cdek
  const en = JSON.parse(read("../i18n/translations/en.json")).orders.fulfillment.cdek
  assert.equal(ru.label, "Наклейка СДЭК")
  assert.equal(ru.waybill, "Квитанция СДЭК")
  assert.equal(ru.errors.notRegistered, "Отправление ещё не зарегистрировано в СДЭК")
  assert.equal(ru.errors.timeout, "СДЭК не успел подготовить файл, попробуйте ещё раз через минуту")
  assert.equal(ru.errors.failed, "СДЭК не отдал файл: {{message}}")
  const keys = (node, prefix = "") =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    )
  assert.deepEqual(keys(en).sort(), keys(ru).sort())
  assert.match(en.errors.failed, /\{\{message\}\}/)
})
