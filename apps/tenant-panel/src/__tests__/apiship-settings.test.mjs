import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-58, part B: «Подключения → ApiShip» rebuilt on the backend of
 * PR #455 (contract section 1). The page reads, each section edits in a drawer
 * on `edit/<section>`; the token and the webhook address never show in full;
 * the probe and the tariff check are their own queries. This package cannot
 * render JSX (no vitest/jsdom, see `error-boundary-auth.test.mjs`), so the
 * contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const DIR = "routes/settings/integrations/apiship"
const page = read(`${DIR}/apiship.tsx`)
const model = read(`${DIR}/apiship-model.ts`)
const rows = read(`${DIR}/apiship-methods-rows.tsx`)
const duplicates = read(`${DIR}/apiship-duplicates.tsx`)
const edit = read(`${DIR}/edit/apiship-edit.tsx`)
const fields = read(`${DIR}/edit/apiship-fields.tsx`)
const DRAWERS = ["connection-drawer", "sender-drawer", "numbers-drawers", "methods-drawer"]
const drawers = DRAWERS.map((name) => read(`${DIR}/edit/${name}.tsx`))
const hook = read("hooks/api/apiship.tsx")
const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

// ── the API ─────────────────────────────────────────────────────────────────

test("the hook reads and writes the whole connection on /tenants/apiship", () => {
  assert.ok(hook.includes('sdk.client.fetch<ApishipResponse>("/tenants/apiship")'), "GET /tenants/apiship")
  assert.ok(hook.includes('"/tenants/apiship", { method: "PUT", body: payload }'), "PUT /tenants/apiship")
  assert.ok(hook.includes('"/tenants/apiship", { method: "DELETE" }'), "DELETE /tenants/apiship")
  assert.ok(hook.includes('query: calculator ? { calculator: 1 } : undefined'), "probe ?calculator=1 only when asked")
  assert.ok(hook.includes('"/tenants/apiship/tariffs"') && hook.includes("query: { provider_key: providerKey }"))
})

test("the hub keeps its own token read on /tenants/apiship/key", () => {
  assert.ok(hook.includes('sdk.client.fetch<ApishipKeyResponse>("/tenants/apiship/key")'))
  assert.ok(read("routes/settings/integrations/integrations.tsx").includes("useApishipKey"))
})

test("a direct duplicate is switched off by the shipping-method route the Почта screen uses", () => {
  assert.ok(hook.includes("`/tenants/shipping-methods/${id}`, { method: \"POST\", body: { enabled: false } }"))
  assert.ok(duplicates.includes("useSwitchOffApishipDuplicate"))
  assert.ok(page.includes("<ApishipDuplicates duplicates={apiship.duplicates} />"))
})

// ── the read page ───────────────────────────────────────────────────────────

test("the page only reads: no form, no input, no save on it", () => {
  for (const forbidden of ["<form", "<Input", "useSaveApiship", 'type="submit"']) {
    assert.ok(!page.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
  assert.ok(page.includes("<SettingsDetailSection"), "sections are the shared SettingsDetailSection")
  assert.ok(page.includes("hasOutlet"), "the drawer of the nested route opens over the page")
})

test("six sections in the contract's order, the first one the screen's h1", () => {
  const order = ["connection", "sender", "parcel", "methods", "markup", "service"]
  const at = order.map((id) => page.indexOf(`id: "${id}",`))
  at.forEach((index, i) => assert.ok(index !== -1, `section ${order[i]} is missing`))
  assert.deepEqual([...at].sort((a, b) => a - b), at, "sections out of the contract's order")
  assert.ok(page.includes('<SettingsDetailSection section={connection} level="h1" />'))
  assert.ok(page.includes("[sender, parcel, methods, markup, service].map"))
})

test("the header state has the contract's four answers", () => {
  const status = model.slice(model.indexOf("export const connectionStatus"), model.indexOf("export const probeVerdict"))
  assert.ok(status.includes("apiship.unreadable") && status.includes("integrations.state.unreadable"))
  assert.ok(status.includes("!apiship.settings") && status.includes("integrations.state.missing"))
  assert.ok(status.includes("!apiship.settings.is_enabled") && status.includes("integrations.apiship.stateOff"))
  assert.ok(status.includes("integrations.state.connected"))
})

test("the probe has three answers and never holds the page (rule 19h / 20a)", () => {
  const verdict = model.slice(model.indexOf("export const probeVerdict"), model.indexOf("export const toNumber"))
  assert.ok(verdict.includes("probeAsking"), "not answered yet")
  assert.ok(verdict.includes("status === 401 || status === 403") && verdict.includes("probeRejected"), "refused")
  assert.ok(verdict.includes("status === null") && verdict.includes("probeSilent"), "silent")
  assert.ok(verdict.includes("probeOkWithCount"), "accepted")
  assert.ok(page.includes("useApishipProbe({}, { enabled: stored })"), "the probe is its own query, only with a token")
})

test("the tariff check runs only on «Проверить тарифы»", () => {
  assert.ok(page.includes("useApishipProbe({ calculator: true }, { enabled: stored && wantsTariffs })"))
  assert.ok(page.includes("const [wantsTariffs, setWantsTariffs] = useState(false)"))
  assert.ok(page.includes('t("integrations.apiship.checkTariffs")'))
})

test("the token shows by its last four only, the webhook address only through SecretValue", () => {
  assert.ok(page.includes("`••••${settings?.token.last4"))
  assert.ok(page.includes("<SecretValue value={apiship.webhook_url} hidden={hideQuery(apiship.webhook_url)}"))
  const shown = page.match(/apiship\.webhook_url/g) ?? []
  assert.equal(shown.length, 3, "webhook_url is only tested, passed to SecretValue and hidden by hideQuery")
})

test("disconnecting asks for the name first (usePrompt)", () => {
  const remove = page.slice(page.indexOf("const handleRemove"), page.indexOf("const verdict"))
  assert.ok(remove.includes("await prompt({") && remove.includes('verificationText: "ApiShip"'))
  assert.ok(remove.indexOf("if (!confirmed) return") < remove.indexOf("await remove()"))
})

test("missing sender fields are named in the sender section, not discovered at «Собрать»", () => {
  assert.ok(page.includes("const missing = new Set(apiship.missing)"))
  assert.ok(page.includes("status: missing.has(field) ? needed : undefined"))
  assert.ok(page.includes("integrations.apiship.senderMissing"))
})

test("a carrier the ApiShip cabinet has not connected says so, with the cabinet's address", () => {
  assert.ok(rows.includes("connected !== null && !connected.has(carrier.provider_key)"))
  assert.ok(rows.includes("integrations.apiship.carrierNotConnected"))
  assert.ok(rows.includes('href="https://a.apiship.ru"'))
})

test("«на сайте» comes from methods[].enabled, the tick from kinds (the owner's choice)", () => {
  const state = model.slice(model.indexOf("export const kindState"), model.indexOf("export const hasPendingMethods"))
  assert.ok(state.includes("chosen: carrier.kinds.includes(kind)"))
  assert.ok(state.includes("live: carrier.methods.some((method) => method.kind === kind && method.enabled)"))
  assert.ok(rows.includes('color={live ? "green" : chosen ? "blue" : "grey"}'), "chosen-not-live is never green")
  assert.ok(rows.includes('t("integrations.apiship.methodChosen")'))
})

test("chosen methods not at the checkout yet say why: no token, ApiShip off, no sender", () => {
  const reason = model.slice(model.indexOf("export const pendingReason"), model.indexOf("export const toNumber"))
  assert.ok(reason.includes("!apiship.settings") && reason.includes("pendingNoToken"))
  assert.ok(reason.includes("!apiship.settings.is_enabled") && reason.includes("pendingOff"))
  assert.ok(reason.includes("pendingSender"))
  assert.equal(ru.integrations.apiship.pendingSender, "Выбранные способы появятся на кассе после заполнения отправителя.")
  assert.ok(rows.includes("pendingReason(t, apiship)"), "the read page shows the reason under the carrier")
  assert.ok(drawers[3].includes("hasPendingMethods(apiship.carriers)") && drawers[3].includes("pendingReason(t, apiship)"))
})

test("the methods drawer ticks what the owner chose (kinds), not what is live", () => {
  assert.ok(drawers[3].includes('courier: carrier.kinds.includes("courier")'))
  assert.ok(drawers[3].includes('pickup: carrier.kinds.includes("pickup")'))
})

// ── the drawers ─────────────────────────────────────────────────────────────

test("one nested route `edit/:section` draws the five drawers; app.tsx does not grow", () => {
  for (const section of ["connection", "sender", "parcel", "methods", "markup"]) {
    assert.ok(edit.includes(`case "${section}":`), `edit/${section} has no drawer`)
    assert.ok(page.includes(`edit/${section}`), `the page does not open edit/${section}`)
  }
  assert.ok(app.includes('path: "edit/:section", lazy: () => import("./routes/settings/integrations/apiship/edit"),'))
  assert.ok(app.split("\n").length <= 1207, "app.tsx must not grow past its 1206 lines")
})

test("every drawer is a SettingsEditDrawer that sends only its own fields", () => {
  for (const [index, source] of drawers.entries()) {
    assert.ok(source.includes("<SettingsEditDrawer"), `${DRAWERS[index]} must use SettingsEditDrawer`)
    assert.ok(source.includes("useApishipEdit()"), `${DRAWERS[index]} saves through useApishipEdit`)
  }
  assert.ok(fields.includes("save: (body: PutApishipBody) => mutateAsync(body)"))
})

test("an empty token field keeps the stored token", () => {
  const connection = drawers[0]
  assert.ok(connection.includes("token: values.token || undefined"))
  assert.ok(connection.includes('type="password"'))
  assert.ok(connection.includes('defaultValues={{ token: "", is_enabled'))
})

test("a save names the carriers ApiShip skipped and a webhook it refused", () => {
  assert.ok(fields.includes("answer.verified?.carriers_skipped"))
  assert.ok(fields.includes("integrations.apiship.carriersSkipped"))
  assert.ok(fields.includes("integrations.apiship.webhookFailed"))
})

test("the methods drawer sends kinds per carrier and null for the cheapest tariff", () => {
  const methods = drawers[3]
  assert.ok(methods.includes("tariff_id: entry.tariff === CHEAPEST ? null : Number(entry.tariff)"))
  assert.ok(methods.includes('...(entry.courier ? (["courier"] as const) : [])'))
  assert.ok(methods.includes("useApishipTariffs(carrier.provider_key, { enabled })"))
})

// ── the words ───────────────────────────────────────────────────────────────

test("every i18n key the ApiShip screen reads literally exists in ru.json and en.json", () => {
  const files = [page, model, rows, duplicates, edit, fields, ...drawers]
  const keys = new Set(files.flatMap((source) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1])))
  assert.ok(keys.size > 60, `expected the screen's keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("the keys built from a field name exist for every field", () => {
  for (const catalog of [ru, en]) {
    const api = catalog.integrations.apiship
    for (const field of ["sender_name", "sender_company", "sender_phone", "sender_email", "sender_city", "sender_region", "sender_address", "sender_index", "sender_mode", "sender_point_id"]) {
      assert.equal(typeof api.sender[field], "string", `sender.${field}`)
    }
    for (const kind of ["courier", "pickup"]) {
      assert.equal(typeof api.kind[kind], "string")
      assert.equal(typeof api.kindHint[kind], "string")
      assert.equal(typeof api.senderMode[kind === "pickup" ? "point" : kind], "string")
    }
    for (const key of ["cdek", "rupost"]) assert.equal(typeof api.carrierLabel[key], "string")
    for (const key of ["door", "doorNone", "point", "pointNone"]) assert.equal(typeof api.quote[key], "string")
  }
})

test("the hub no longer says ApiShip is not used at the checkout", () => {
  assert.ok(!/не используется/.test(ru.integrations.apiship.rowNote))
  assert.equal(ru.integrations.apiship.notInCheckout, undefined, "the old «не заведён на кассу» alert is gone")
})

test("no English fallback and no literal string on the screen (rule 7)", () => {
  for (const source of [page, rows, duplicates, ...drawers]) {
    assert.ok(!source.includes("defaultValue:"), "a defaultValue fallback is a literal on screen")
  }
})

test("every file of the screen stays under 800 lines", () => {
  for (const [name, source] of [["apiship.tsx", page], ["hook", hook], ...DRAWERS.map((n, i) => [n, drawers[i]])]) {
    assert.ok(source.split("\n").length < 800, `${name} is ${source.split("\n").length} lines`)
  }
})

// ── fixes after the blind mockup (t-2026-10-14-58, step b-panel-fixes) ─────

test("no transport words on the owner's screen: no header, no Bearer, no server host (rule 6)", () => {
  for (const [name, catalog] of [["ru", ru], ["en", en]]) {
    const words = JSON.stringify(catalog.integrations.apiship)
    for (const banned of [/Authorization/, /Bearer/, /api\.dev\./, /api\.apiship\.ru/]) {
      assert.ok(!banned.test(words), `${name}.json integrations.apiship says ${banned}`)
    }
  }
  assert.equal(ru.integrations.apiship.tokenHint, "Токен — в личном кабинете ApiShip, раздел «API».")
  assert.equal(ru.integrations.apiship.testContour, "тестовый контур")
  assert.equal(ru.integrations.apiship.testContourHint, "Заказы и наклейки не настоящие: перевозчик их не увидит.")
})

test("a new shop sees one card, one sentence and one «Подключить ApiShip» (E8), no «—» rows", () => {
  const empty = page.slice(page.indexOf("if (!settings && !apiship.unreadable)"), page.indexOf("const missing = new Set"))
  assert.ok(empty.length > 0, "the empty branch must come before the sections are built")
  assert.ok(empty.includes("<NoRecords"))
  assert.ok(empty.includes('action={{ to: "edit/connection", label: t("integrations.apiship.connect") }}'))
  assert.ok(empty.includes("rows: []") && empty.includes("actions: []"), "no rows and no «…» in the empty card")
  assert.ok(!empty.includes("ApishipDuplicates") && !empty.includes("[sender, parcel"), "no other section")
  assert.equal(ru.integrations.apiship.connect, "Подключить ApiShip")
  const detail = read("components/settings/settings-detail/settings-detail.tsx")
  assert.ok(detail.includes("{section.body ??"), "the shared section draws the body instead of the rows")
})

test("a pinned tariff reads by its name from the tariff list, the number only without it", () => {
  assert.ok(!rows.includes("tariffPinned"), "the read page no longer says «тариф № 47»")
  const pinned = rows.slice(rows.indexOf("const PinnedTariff"), rows.indexOf("const cheapestText"))
  assert.ok(pinned.includes("useApishipTariffs(providerKey, { enabled })"), "the drawer's own query")
  assert.ok(pinned.includes("tariffs?.find((tariff) => tariff.id === id)?.name"))
  assert.ok(pinned.includes('t("integrations.apiship.tariffOption", { name, id })'), "as the drawer names it")
  assert.ok(pinned.includes('t("integrations.apiship.tariffNumber", { id })'), "the number while there is no name")
  assert.ok(rows.includes("enabled={Boolean(apiship.settings)}"), "ApiShip is asked only with a token")
  assert.equal(ru.integrations.apiship.tariffOption, "{{name}} (№ {{id}})")
})

test("the sender drawer marks an empty required field with the read page's reason", () => {
  const sender = drawers[1]
  assert.ok(sender.includes('missing.has(field) ? t("integrations.apiship.neededToShip") : undefined'))
  for (const field of ["sender_name", "sender_phone", "sender_city", "sender_address"]) {
    assert.ok(sender.includes(`needed={needed("${field}")}`), `${field} is not marked`)
  }
  assert.ok(fields.includes('needed && !String(field.value ?? "").trim()'), "the mark goes once the field is filled")
  assert.ok(fields.includes('<StatusBadge color="orange"'), "the same orange badge as the read page")
})

test("the connection switch keeps its width when its description wraps on a phone", () => {
  assert.ok(read("components/common/switch-box/switch-box.tsx").includes('className="shrink-0 rtl:rotate-180"'))
})
