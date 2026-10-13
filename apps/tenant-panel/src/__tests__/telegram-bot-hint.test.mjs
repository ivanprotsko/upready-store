import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Настройки → Интеграции → Telegram» tells the owner how to connect a bot
 * alone (t-2026-10-14-11): four numbered steps in ru and en, the shop's real
 * address in the last one, and no «попросите Ивана». The JSX cannot be
 * rendered in this package (see error-boundary-auth.test.mjs), so this reads
 * the screen source and both catalogs.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const screen = readFileSync(join(SRC, "routes/settings/integrations/telegram-bot/telegram-bot.tsx"), "utf8")
const catalog = (locale) =>
  JSON.parse(readFileSync(join(SRC, `i18n/translations/${locale}.json`), "utf8")).integrations.telegramBot

const KEYS = ["botFatherHint", "botFatherStep1", "botFatherStep2", "botFatherStep3", "botFatherStep4", "botFatherStep4NoHost"]

for (const locale of ["ru", "en"]) {
  test(`${locale}: the hint has every key, walks /newbot and /setdomain, and does not send the owner to Ivan`, () => {
    const strings = catalog(locale)
    for (const key of KEYS) assert.ok(strings[key], `${locale} ${key}`)
    assert.match(strings.botFatherStep1, /\/newbot/)
    assert.match(strings.botFatherStep4, /\/setdomain/)
    assert.match(strings.botFatherStep4NoHost, /\/setdomain/)
    assert.match(strings.botFatherStep4, /\{\{host\}\}/)
    assert.doesNotMatch(strings.botFatherStep4NoHost, /\{\{host\}\}/)
    assert.doesNotMatch(KEYS.map((key) => strings[key]).join(" "), /Ivan|Иван/)
    assert.doesNotMatch(KEYS.map((key) => strings[key]).join(" "), /setmenubutton/i)
  })
}

test("the screen renders the four steps in an ordered list with the shop's primary host", () => {
  assert.match(screen, /useDomains\(\)/)
  assert.match(screen, /<ol\b/)
  for (const n of [1, 2, 3]) assert.match(screen, new RegExp(`botFatherStep${n}"`))
  assert.match(screen, /botFatherStep4",\s*\{\s*host: shopHost/)
  assert.match(screen, /botFatherStep4NoHost/)
})
