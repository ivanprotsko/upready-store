import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

/**
 * «Бот в Telegram» — the webhook block on Settings → Integrations → Telegram
 * bot (t-cherk-23: «Подключить бота» / «Переподключить» / «Отключить», plus
 * the manager deep link). Same approach as `robokassa-mode-error-text.test.mjs`:
 * the page is plain TSX with hooks, so it is checked by source and by its i18n
 * catalogs rather than rendered, the way this suite's other integration tests
 * do.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const catalogs = {
  ru: JSON.parse(read("../i18n/translations/ru.json")),
  en: JSON.parse(read("../i18n/translations/en.json")),
}
const lookup = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)

const webhookKeys = [
  "integrations.telegramBot.webhookTitle",
  "integrations.telegramBot.webhookConnected",
  "integrations.telegramBot.webhookNotConnected",
  "integrations.telegramBot.connect",
  "integrations.telegramBot.reconnect",
  "integrations.telegramBot.disconnect",
  "integrations.telegramBot.connected",
  "integrations.telegramBot.disconnected",
  "integrations.telegramBot.disconnectTitle",
  "integrations.telegramBot.disconnectDescription",
  "integrations.telegramBot.managerLinkLabel",
  "integrations.telegramBot.managerLinkHint",
  "integrations.telegramBot.managerLinked",
]

test("every webhook string exists in Russian and in English, and they differ", () => {
  for (const key of webhookKeys) {
    const ru = lookup(catalogs.ru, key)
    const en = lookup(catalogs.en, key)
    assert.equal(typeof ru, "string", `ru ${key}`)
    assert.equal(typeof en, "string", `en ${key}`)
    assert.ok(ru.length > 0 && en.length > 0, key)
    assert.notEqual(ru, en, `${key} is translated, not copied`)
  }
})

test("the manager link hint names /manager, in both languages", () => {
  assert.match(catalogs.ru.integrations.telegramBot.managerLinkHint, /\/manager/)
  assert.match(catalogs.en.integrations.telegramBot.managerLinkHint, /\/manager/)
})

test("the page wires the webhook hooks and shows connect/reconnect/disconnect", () => {
  const source = read("../routes/settings/integrations/telegram-bot/telegram-bot.tsx")
  assert.match(source, /useConnectTelegramBotWebhook/)
  assert.match(source, /useDisconnectTelegramBotWebhook/)
  assert.match(source, /webhookConnected\s*\?\s*\n?\s*t\("integrations\.telegramBot\.reconnect"\)/)
  assert.match(source, /t\("integrations\.telegramBot\.connect"\)/)
  assert.match(source, /data-testid="telegram-bot-webhook-connect"/)
  assert.match(source, /data-testid="telegram-bot-webhook-disconnect"/)
  assert.match(source, /data-testid="telegram-bot-manager-link"/)
  // The webhook block only ever shows once a bot is saved — `stored` gates it,
  // the same guard the token form's own "Удалить" button already uses.
  assert.match(source, /\{stored \? \(\s*<div className="flex flex-col gap-y-4 px-6 py-6" data-testid="telegram-bot-webhook">/)
})

test("the hook module exports the two webhook mutations against /tenants/telegram-bot/webhook", () => {
  const source = read("../hooks/api/telegram-bot.tsx")
  assert.match(source, /export const useConnectTelegramBotWebhook/)
  assert.match(source, /export const useDisconnectTelegramBotWebhook/)
  const webhookCalls = source.match(/"\/tenants\/telegram-bot\/webhook"/g) ?? []
  assert.equal(webhookCalls.length, 2, "one fetch call per webhook mutation")
  assert.match(source, /method: "POST"/)
  assert.match(source, /method: "DELETE"/)
})
