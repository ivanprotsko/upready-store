import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-58, part B: an ApiShip shipment on the order card (contract
 * section 2) and the orders list's batch (section 3) — the order number in
 * ApiShip, its status in words and colour, the carrier's reason under a red
 * one, the label, the act and a fresh status from the «…» menu, and the same
 * three for up to 100 ticked orders. Asserted on the source: this package
 * cannot render JSX (see `error-boundary-auth.test.mjs`).
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const CARD_DIR = "routes/orders/order-detail/components/order-fulfillment-section"
const card = read(`${CARD_DIR}/apiship-shipment.tsx`)
const section = read(`${CARD_DIR}/order-fulfillment-section.tsx`)
const status = read("lib/apiship-status.ts")
const hook = read("hooks/api/apiship.tsx")
const batch = read("routes/orders/order-list/components/order-list-table/apiship-batch.tsx")
const list = read("routes/orders/order-list/components/order-list-table/order-list-table.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

// The status keys and their stage, as the backend's `src/apiship/statuses.ts` names them.
const STAGES = {
  blue: ["pending", "uploading", "uploaded"],
  green: ["onPointIn", "onWay", "onPointOut", "readyForRecipient", "delivering", "delivered"],
  red: ["uploadingError", "problem", "lost"],
  orange: ["partialReturn", "returnReady", "returning", "returned", "returnedFromDelivery", "deliveryCanceled"],
  grey: ["notApplicable", "unknown"],
}

// ── the status map ──────────────────────────────────────────────────────────

test("every ApiShip status has its words in ru.json and en.json, in one key map", () => {
  for (const key of Object.values(STAGES).flat()) {
    assert.ok(status.includes(`"${key}",`), `APISHIP_STATUS_KEYS lacks ${key}`)
    assert.equal(typeof ru.apishipShipment.status[key], "string", `ru status ${key}`)
    assert.equal(typeof en.apishipShipment.status[key], "string", `en status ${key}`)
  }
  assert.equal(ru.apishipShipment.status.uploadingError, "Перевозчик не принял заказ")
  assert.equal(ru.apishipShipment.status.onPointIn, "Принят на склад отправления")
  assert.equal(ru.apishipShipment.status.delivered, "Вручён получателю")
})

test("the colour follows the stage: blue, green, red, orange", () => {
  const setOf = (name) => {
    const match = status.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))
    assert.ok(match, `no ${name} set`)
    return match[1].match(/"([A-Za-z]+)"/g).map((s) => s.slice(1, -1))
  }
  assert.deepEqual(setOf("BLUE"), STAGES.blue)
  assert.deepEqual(setOf("GREEN"), STAGES.green)
  assert.deepEqual(setOf("RED"), STAGES.red)
  assert.deepEqual(setOf("ORANGE"), STAGES.orange)
})

test("an ApiShip fulfillment is told by its provider or its data (contract section 2)", () => {
  assert.ok(status.includes('export const APISHIP_PROVIDER_ID = "apiship_apiship"'))
  assert.ok(status.includes('fulfillment.provider_id === APISHIP_PROVIDER_ID || fulfillment.data?.provider === "apiship"'))
})

// ── the order card ──────────────────────────────────────────────────────────

test("the card shows the ApiShip order number, the status badge and the reason under a red one", () => {
  assert.ok(card.includes('t("apishipShipment.orderLabel")') && card.includes('"apishipShipment.orderNumber"'))
  assert.equal(ru.apishipShipment.orderLabel, "Заказ в ApiShip")
  assert.ok(card.includes("<StatusBadge color={color}"))
  assert.ok(card.includes("t(apishipStatusKey(data.apiship_status))"))
  assert.ok(card.includes('color === "red" && data.apiship_status_detail'), "the reason only under a red status")
})

test("the card says where the parcel goes and by which tariff", () => {
  assert.ok(card.includes('data.kind === "pickup"') && card.includes("data.apiship_point_address"))
  assert.ok(card.includes("[carrier, data.tariff_name, data.term_label]"))
})

test("the «…» of an ApiShip shipment downloads the label and the act and refreshes the status", () => {
  for (const key of ["apishipShipment.actions.label", "apishipShipment.actions.waybill", "apishipShipment.actions.sync"]) {
    assert.ok(card.includes(`t("${key}")`), `missing ${key}`)
  }
  assert.equal(ru.apishipShipment.actions.label, "Скачать наклейку")
  assert.equal(ru.apishipShipment.actions.waybill, "Скачать акт")
  assert.equal(ru.apishipShipment.actions.sync, "Обновить статус")
  assert.ok(card.includes('onClick: () => handleDocument("labels")'))
  assert.ok(card.includes('onClick: () => handleDocument("waybills")'))
  assert.ok(card.includes("fulfillment_ids: [fulfillment.id]"), "one shipment's documents, not the order's all")
})

test("the documents and the status go to the contract's routes; the file is saved through a blob", () => {
  assert.ok(hook.includes('"/tenants/apiship/documents", { method: "POST", body }'))
  assert.ok(hook.includes('"/tenants/apiship/status-sync"'))
  assert.ok(hook.includes('headers: { accept: "application/pdf" }'), "the SDK hands back the raw Response")
  assert.ok(hook.includes("URL.createObjectURL(blob)") && hook.includes("link.download = filename"))
  assert.ok(hook.includes("query: { ...query, name: filename }"), "GET <download>&name=<file>")
  assert.ok(hook.includes("queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })"), "the order is read again")
})

test("the toasts of «Обновить статус»: updated, no changes, ApiShip's error", () => {
  const sync = card.slice(card.indexOf("const handleSync"), card.indexOf("return [", card.indexOf("const handleSync")))
  assert.ok(sync.includes("toast.error(mine.error)"))
  assert.ok(sync.includes('"apishipShipment.toast.statusUpdated"'))
  assert.ok(sync.includes('t("apishipShipment.toast.statusSame")'))
  assert.equal(ru.apishipShipment.toast.statusSame, "Изменений нет")
})

test("«Заказ не был передан в СД» reads as what to do, not as ApiShip's jargon", () => {
  assert.ok(status.includes("/не был передан в СД/i"))
  assert.ok(card.includes('isNotYetWithCarrier(failed.message) ? t("apishipShipment.notYetWithCarrier")'))
  assert.match(ru.apishipShipment.notYetWithCarrier, /Обновить статус/)
})

test("a cancelled shipment or one without an ApiShip order offers no document", () => {
  assert.ok(card.includes("const closed = Boolean(fulfillment.canceled_at) || !data.apiship_order_id"))
  assert.equal((card.match(/disabled: closed \|\| busy/g) ?? []).length, 3)
})

test("the section file only mounts the ApiShip part, before the dangerous «Отменить»", () => {
  assert.ok(
    section.includes(
      'import { ApishipShipmentRows, useApishipCancelAction, useApishipShipmentActions } from "./apiship-shipment"'
    )
  )
  assert.ok(section.includes("<ApishipShipmentRows fulfillment={fulfillment} />"))
  const groups = section.slice(section.indexOf("groups={["), section.indexOf('label: t("actions.cancel")'))
  assert.ok(groups.includes("...apishipActions,"), "the ApiShip group stands before the cancel group")
  assert.ok(section.split("\n").length < 800, "the section file stays under 800 lines")
})

// ── the orders list ─────────────────────────────────────────────────────────

test("the orders list ticks rows and offers the three ApiShip batch actions", () => {
  assert.ok(list.includes("enableRowSelection: true") && list.includes("getRowId: (row) => row.id"))
  assert.ok(list.includes("commands={commands}"))
  assert.ok(list.includes("[selectColumn, ...baseColumns]"))
  for (const key of ["labels", "waybills", "sync"]) {
    assert.ok(batch.includes(`t("apishipShipment.batch.${key}")`), `batch action ${key}`)
  }
  assert.equal(ru.apishipShipment.batch.labels, "Наклейки ApiShip")
  assert.equal(ru.apishipShipment.batch.waybills, "Акты ApiShip")
  assert.equal(ru.apishipShipment.batch.sync, "Обновить статусы")
})

test("a batch is at most 100 orders, as the route takes", () => {
  assert.ok(batch.includes("export const APISHIP_BATCH_LIMIT = 100"))
  assert.ok(batch.includes("ids.length > APISHIP_BATCH_LIMIT"))
})

test("what failed and what has no shipment are named by order number", () => {
  assert.ok(batch.includes("for (const failed of answer.failed)"))
  assert.ok(batch.includes("answer.without_shipment.map(numberOf)"))
  assert.ok(batch.includes("const numberOf = (id: string) => `№ ${numbers.current.get(id) ?? id}`"))
})

test("every i18n key the card and the batch read literally exists in ru.json and en.json", () => {
  const keys = new Set(
    [card, batch].flatMap((source) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  for (const kind of ["labels", "waybills"]) {
    keys.add(`apishipShipment.toast.${kind}Ready`)
    keys.add(`apishipShipment.batch.${kind}Ready`)
  }
  assert.ok(keys.size > 15, `expected the keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
  for (const form of ["one", "few", "many", "other"]) {
    assert.equal(typeof ru.apishipShipment.batch[`labelsReady_${form}`], "string", `ru plural ${form}`)
  }
})

// ── fixes after the blind mockup (t-2026-10-14-58, step b-panel-fixes) ─────

test("a long carrier status wraps inside its badge on a phone, never cut by the card", () => {
  assert.ok(!card.includes("text-nowrap"), "the ApiShip status badge must be allowed to wrap")
  assert.ok(card.includes('const BADGE_WRAPS = "max-w-full items-start py-px leading-4"'))
  assert.equal((card.match(/className=\{BADGE_WRAPS\}/g) ?? []).length, 2, "both status badges wrap")
})

test("the cancel of an ApiShip shipment says «Отменить отправку» in the error colour, after the divider", () => {
  assert.equal(ru.apishipShipment.actions.cancel, "Отменить отправку")
  assert.equal(en.apishipShipment.actions.cancel, "Cancel shipment")
  const hookCancel = card.slice(card.indexOf("export const useApishipCancelAction"), card.indexOf("export const useApishipShipmentActions"))
  assert.ok(hookCancel.includes("isApishipFulfillment(fulfillment)"), "only an ApiShip shipment is renamed")
  assert.ok(hookCancel.includes('{ label: t("apishipShipment.actions.cancel"), destructive: true }'))
  const cancel = section.slice(section.indexOf('label: t("actions.cancel")'), section.indexOf("onClick: handleCancel"))
  assert.ok(cancel.includes("...apishipCancel,"), "the ApiShip words override the section's «Отмена»")
  const menu = read("components/common/action-menu/action-menu.tsx")
  assert.ok(menu.includes("destructive?: boolean"))
  assert.ok(menu.includes('"text-ui-fg-error [&_svg]:text-ui-fg-error":\n                              action.destructive && !action.disabled'))
})

test("on a phone the batch bar is a sheet: every command visible, one per line", () => {
  const root = read("components/table/data-table/data-table-root/data-table-root.tsx")
  const bar = root.match(/const PHONE_BAR =\s*"([^"]+)"/)?.[1] ?? ""
  for (const cls of ["max-sm:w-[calc(100vw-2rem)]", "max-sm:flex-col", "max-sm:items-stretch"]) {
    assert.ok(bar.includes(cls), `PHONE_BAR lacks ${cls}`)
  }
  assert.ok(root.includes('const PHONE_SEPARATOR = "max-sm:h-px max-sm:w-full"'))
  assert.ok(root.includes("max-sm:[&_kbd]:hidden"), "no keyboard hints on a phone")
  assert.ok(root.includes("<CommandBar.Bar className={PHONE_BAR}>"))
  assert.ok(root.includes("className={PHONE_COMMAND}"))
  assert.equal((root.match(/<CommandBar\.Seperator className=\{PHONE_SEPARATOR\} \/>/g) ?? []).length, 2)
})
