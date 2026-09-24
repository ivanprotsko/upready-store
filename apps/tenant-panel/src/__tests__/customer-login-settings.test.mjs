import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Вход покупателей» (o25-login-methods, t-2026-09-24-n8): the block that lets
 * a shop owner choose email and password, Yandex ID, or both, for her own
 * buyers. `customer-login.tsx` is JSX this package cannot render (no
 * vitest/jsdom, the same note every other panel test here carries — see
 * `error-boundary-auth.test.mjs`), so this asserts on the source directly:
 * the three states the task named — the Yandex-inclusive options disabled
 * with an honest hint when the platform has no Yandex keys, the whole block
 * disabled while it loads or saves, and the save outcome reported as a toast.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const blockSource = readFileSync(
  join(SRC, "routes/settings/customer-login/customer-login.tsx"),
  "utf8"
)
const hookSource = readFileSync(join(SRC, "hooks/api/login-settings.tsx"), "utf8")

test("offers exactly the three methods the task named, each backed by its own i18n key", () => {
  for (const value of ["email", "yandex", "both"]) {
    const choiceBoxIndex = blockSource.indexOf(`value="${value}"`)
    assert.notEqual(choiceBoxIndex, -1, `no RadioGroup.ChoiceBox for "${value}"`)

    const block = blockSource.slice(choiceBoxIndex, blockSource.indexOf("/>", choiceBoxIndex))
    assert.ok(
      block.includes(`t("customerLogin.options.${value}.label")`),
      `"${value}" must read its label from customerLogin.options.${value}.label`
    )
    assert.ok(
      block.includes(`t("customerLogin.options.${value}.description")`),
      `"${value}" must read its description from customerLogin.options.${value}.description`
    )
  }
})

test("the Yandex-inclusive options are disabled without platform keys; email alone is not", () => {
  const emailBlock = blockSource.slice(
    blockSource.indexOf('value="email"'),
    blockSource.indexOf("/>", blockSource.indexOf('value="email"'))
  )
  assert.ok(
    !emailBlock.includes("!yandexAvailable"),
    "email must stay selectable regardless of the platform's Yandex keys"
  )

  for (const value of ["yandex", "both"]) {
    const start = blockSource.indexOf(`value="${value}"`)
    const block = blockSource.slice(start, blockSource.indexOf("/>", start))
    assert.ok(
      block.includes("disabled={busy || !yandexAvailable}"),
      `"${value}" must be disabled whenever the platform has no Yandex keys, not only while busy`
    )
  }
})

test("the honest hint about missing Yandex keys is conditioned on the same flag that disables the options", () => {
  const hintIndex = blockSource.indexOf("customerLogin.yandexUnavailableHint")
  assert.notEqual(hintIndex, -1, "the hint must exist")

  const before = blockSource.slice(Math.max(0, hintIndex - 200), hintIndex)
  assert.ok(
    before.includes("!yandexAvailable"),
    "the hint must render exactly when the Yandex options are disabled for that reason, not unconditionally"
  )
})

test("yandexAvailable comes from the backend's own platform flag, never guessed on the panel side", () => {
  assert.ok(
    blockSource.includes("saved?.yandex_platform_available"),
    "availability must be read from the backend response (whether YANDEX_CLIENT_ID is set), not hardcoded"
  )
})

test("the block disables itself while the setting is loading or saving, the same rule-19h shape as SEO verification", () => {
  assert.ok(blockSource.includes("loaded === null"), "must track whether the first read has landed")
  assert.ok(
    blockSource.includes("const busy = loaded === null || isSaving"),
    "busy must cover both loading and saving, not saving alone"
  )
})

test("a save reports its own outcome as a toast, success and failure both", () => {
  const submitIndex = blockSource.indexOf("handleSubmit")
  const submitBlock = blockSource.slice(submitIndex)
  assert.ok(submitBlock.includes("toast.success(t(\"customerLogin.saved\"))"), "a successful save must toast")
  assert.ok(
    submitBlock.includes("toast.error(saveError.message)"),
    "a failed save must surface the backend's own message, not fail silently"
  )
})

test("the setting round-trips through GET/PUT /tenants/login-settings, one field, no per-field merge", () => {
  assert.ok(hookSource.includes('"/tenants/login-settings"'), "the hook must call the tenant's own login-settings route")
  assert.ok(hookSource.includes('method: "PUT"'), "saving must PUT, not POST")
})
