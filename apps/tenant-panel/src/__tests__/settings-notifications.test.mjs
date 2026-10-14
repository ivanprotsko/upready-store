import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G1 part 3): `/settings/notifications`
 * rebuilt on `SettingsDetail`, a `SettingsEditDrawer` for the letter and a
 * drawer without a form for connecting Telegram. This package cannot render
 * JSX (no vitest/jsdom, see `settings-detail-edit-drawer.test.mjs`), so the
 * contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const page = read("routes/settings/notifications/notifications.tsx")
const edit = read("routes/settings/notifications/edit.tsx")
const connect = read("routes/settings/notifications/telegram-connect.tsx")
const detail = read("components/settings/settings-detail/settings-detail.tsx")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)
const between = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)))

test("the page only reads: a SettingsDetail, no form, no field, no save button", () => {
  assert.ok(page.includes("<SettingsDetail"))
  for (const forbidden of ["<form", "<Input", "<Label", "useUpdateNotificationSettings", "notificationSettings.save", "useState", "useEffect"]) {
    assert.ok(!page.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
})

test("two sections of equal rank, the letter first; the setting's name only in the breadcrumb (E11)", () => {
  assert.ok(page.includes("sections={[emailSection, telegramSection]}"))
  assert.ok(page.includes('id: "email"') && page.includes('id: "telegram"'))
  assert.ok(!page.includes("<Heading") && !page.includes("notificationSettings.subtitle"), "no page title above the cards")
  assert.ok(app.includes('path: "/settings/notifications",\n            handle: { breadcrumb: () => t("notificationSettings.title") }'))
})

test("the letter: StatusBadge and its explanation in the header, three read rows, edited on `edit`", () => {
  const email = between(page, "const emailSection", "const telegramActions")
  assert.ok(email.includes('{ color: "orange", label: t("notificationSettings.email.off") }'))
  assert.ok(email.includes('t("notificationSettings.email.offHint")'), "offHint is the section subtitle")
  assert.ok(email.includes('editTo: "edit"'))
  for (const id of ["from_name", "reply_to"]) assert.ok(email.includes(`id: "${id}"`), id)
  assert.ok(email.includes('deliveryRow("email_last", email?.last)'))
  // Rule 19: an empty value reads «—» with what it means, no «не заполнено» badge.
  assert.ok(email.includes('t("notificationSettings.email.replyToEmpty")'))
  assert.ok(!email.includes("notFilled"))
})

test("the last delivery: shared date formatter with time, a green or red badge, the known reason under it", () => {
  const row = between(page, "const deliveryRow", "const handleTest")
  assert.ok(row.includes("getFullDate({ date: last.at, includeTime: true })"), "rule 14")
  assert.ok(row.includes('{ color: "green", label: t("notificationSettings.last.ok") }'))
  assert.ok(row.includes('{ color: "red", label: t("notificationSettings.last.failed") }'))
  assert.ok(row.includes('t("notificationSettings.noProviderError")'))
  assert.ok(row.includes('hint: t("notificationSettings.last.never")'), "nothing sent yet: «—» and a phrase")
  for (const source of [page, connect]) {
    assert.ok(!source.includes("toLocaleString") && !source.includes("Intl.DateTimeFormat"))
  }
})

test("the letter drawer: SettingsEditDrawer with the two optional fields, mounted from the saved record", () => {
  assert.ok(edit.includes("<SettingsEditDrawer<EmailValues>"))
  assert.ok(edit.includes("email_from_name: zod.string().trim()"))
  assert.ok(edit.includes('email_reply_to: zod.union([zod.literal(""), zod.string().trim().email(invalid)])'))
  assert.ok(edit.includes('emailSchema(t("notificationSettings.email.replyToInvalid"))'), "the zod message is a key, not English")
  assert.ok(edit.includes('email_from_name: settings?.email.from_name ?? ""'))
  assert.ok(edit.includes('email_reply_to: settings?.email.reply_to ?? ""'))
  assert.ok(edit.includes("isPending={isPending}"))
  assert.equal((edit.match(/<Form\.Label optional>/g) ?? []).length, 2)
})

test("Telegram connected: green badge, chat and «Подключён» rows, «…» = Проверить, Подключить другой чат, ─, Отключить", () => {
  const actions = between(page, "const telegramActions", "// Telegram is not enabled")
  const order = [
    't("notificationSettings.telegram.test")',
    't("notificationSettings.telegram.reconnect")',
    't("notificationSettings.telegram.unlink")',
  ].map((key) => actions.indexOf(key))
  assert.ok(order.every((at) => at > 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  // Two groups: ActionMenu draws the separator between them, the dangerous one last.
  const groups = actions.slice(actions.indexOf("actions: ["), actions.lastIndexOf("],"))
  assert.equal((groups.match(/\{\n\s+actions: \[/g) ?? []).length, 2)
  assert.ok(page.includes('{ color: "green", label: t("notificationSettings.telegram.connected") }'))
  assert.ok(page.includes('label: t("notificationSettings.telegram.chat"), value: chat'))
  assert.ok(page.includes('t("notificationSettings.telegram.linkedAt")'))
  assert.ok(page.includes("getFullDate({ date: telegram.linked_at, includeTime: true })"))
})

test("«Отключить» asks first through usePrompt, naming the chat; no red button on the page", () => {
  const unlink = between(page, "const handleUnlink", "const emailSection")
  assert.ok(unlink.includes("await prompt({"))
  assert.ok(unlink.includes('t("notificationSettings.telegram.unlinkPrompt.description", { chat })'))
  assert.ok(unlink.indexOf("if (!confirmed)") < unlink.indexOf("await unlink("))
  assert.ok(!page.includes('variant="danger"'))
  assert.match(ru.notificationSettings.telegram.unlinkPrompt.description, /«\{\{chat\}\}»/)
})

test("Telegram not connected: grey badge, the instruction as subtitle, one «Подключить Telegram» button and no «…»", () => {
  const off = page.slice(page.indexOf("// Telegram is not enabled"), page.indexOf("const telegramSection"))
  const connectable = off.slice(off.indexOf("return {\n      description: t(\"notificationSettings.telegram.hint\")"))
  assert.ok(connectable.includes("actions: [],"))
  assert.ok(connectable.includes('<Button size="small" variant="secondary" asChild>'))
  assert.ok(connectable.includes("<Link to={TELEGRAM_CONNECT}"))
  assert.ok(page.includes('const TELEGRAM_CONNECT = "telegram-connect"'))
  assert.ok(page.includes('{ color: "grey", label: t("notificationSettings.telegram.notConnected") }'))
})

test("Telegram not enabled on the platform: «напишите в поддержку», no button, no menu (Ivan's fork 5)", () => {
  const off = page.slice(page.indexOf("if (telegram?.configured === false)"), page.indexOf("return {\n      description: t(\"notificationSettings.telegram.hint\")"))
  assert.ok(off.includes('return { description: t("notificationSettings.telegram.offHint"), actions: [] }'))
  assert.ok(!off.includes("action:"))
  assert.match(ru.notificationSettings.telegram.offHint, /поддержку/)
})

test("the connect drawer has no form: steps, the link with «Скопировать», its lifetime, and only «Закрыть» (rule 20)", () => {
  assert.ok(connect.includes("<RouteDrawer>"))
  for (const forbidden of ["SettingsEditDrawer", "RouteDrawer.Form", "<form", "actions.save", "actions.cancel"]) {
    assert.ok(!connect.includes(forbidden), `the connect drawer must not carry ${forbidden}`)
  }
  assert.ok(connect.includes('t("actions.close")'))
  assert.equal((connect.match(/<Button/g) ?? []).length, 3, "copy, retry, close")
  assert.ok(connect.includes("<Copy content={code.deep_link} asChild>"))
  for (const step of ["step1", "step2", "step3"]) assert.ok(connect.includes(`"${step}"`), step)
  assert.ok(connect.includes('t("notificationSettings.telegram.connectDrawer.linkHint", { count: minutes })'))
  assert.ok(connect.includes("Math.round(code.ttl_seconds / 60)"), "the lifetime comes from the backend, not a literal 15")
})

test("the connect drawer issues one link per opening and closes itself once the chat is linked", () => {
  assert.ok(connect.includes("if (issued.current)"), "StrictMode's second mount does not issue a second code")
  assert.ok(connect.includes("refetchInterval: code ? RECHECK_MS : false"))
  assert.ok(connect.includes("telegram.linked_at !== linkedBefore.current"))
  assert.ok(connect.indexOf("toast.success(") < connect.indexOf("handleSuccess()", connect.indexOf("toast.success(")))
  assert.ok(connect.includes('t("notificationSettings.telegram.connectDrawer.retry")'), "a failed link can be asked again")
})

test("both drawers are nested routes next to the page and overlay rows in owner-routes.mjs", () => {
  for (const route of ["edit", "telegram-connect"]) {
    assert.ok(app.includes(`import("./routes/settings/notifications/${route}")`), `app.tsx lazy-loads ${route}`)
    assert.ok(ownerRoutes.includes(`{ path: "/settings/notifications/${route}", kind: "overlay" }`), `owner-routes.mjs lists ${route}`)
  }
  assert.ok(edit.includes("export { NotificationsEmailEdit as Component }"))
  assert.ok(connect.includes("export { TelegramConnect as Component }"))
})

test("SettingsSection takes its own «…» groups and one header button; the default stays «Изменить»", () => {
  assert.ok(detail.includes("actions?: ActionGroup[]"))
  assert.ok(detail.includes("action?: ReactNode"))
  assert.ok(detail.includes("const groups: ActionGroup[] = section.actions ?? ["))
  assert.ok(detail.includes("{groups.length ? ("), "`actions: []` draws no «…»")
  assert.ok(detail.includes("{section.action}"))
})

test("no literal Russian or English string in the screen's code, no English default fallback", () => {
  for (const source of [page, edit, connect]) {
    const code = source.replace(/\/\/.*$/gm, "")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-я]{3,}/.test(code), "no Russian literal in code")
    assert.ok(!source.includes("defaultValue:"), "no English default fallback")
    assert.ok(!source.includes('placeholder="'), "placeholders are keys too")
  }
})

test("every i18n key the screen reads exists in ru.json and en.json", () => {
  const keys = new Set(
    [page, edit, connect].flatMap((source) => [...source.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  for (const step of ["step1", "step2", "step3"]) keys.add(`notificationSettings.telegram.connectDrawer.${step}`)
  assert.ok(keys.size > 35, `expected the screen's keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("the link's lifetime has Russian plural forms and reads right: 1 минуту, 2 минуты, 15 минут", () => {
  const drawer = ru.notificationSettings.telegram.connectDrawer
  for (const form of ["one", "few", "many", "other"]) assert.equal(typeof drawer[`linkHint_${form}`], "string", form)
  for (const form of ["one", "other"]) assert.equal(typeof en.notificationSettings.telegram.connectDrawer[`linkHint_${form}`], "string", form)
  assert.match(drawer.linkHint_one, /\{\{count\}\} минуту /)
  assert.match(drawer.linkHint_few, /\{\{count\}\} минуты /)
  assert.match(drawer.linkHint_many, /\{\{count\}\} минут /)
})
