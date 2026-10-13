import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Вход покупателей» (o25-login-methods, t-2026-09-24-n8): the block that lets
 * a shop owner choose email and password, Yandex ID, or both, for their own
 * buyers. The screen is JSX this package cannot render (no vitest/jsdom, the
 * same note every other panel test here carries — see
 * `error-boundary-auth.test.mjs`), so this asserts on the source directly.
 *
 * t-2026-10-14-01 (panel redesign, G1): the screen now only reads
 * (`customer-login.tsx`, a `SettingsDetail`), and the choice moved into the
 * drawer of its nested `edit` route (`customer-login-edit`, a
 * `SettingsEditDrawer`). The states the task named still hold: the
 * Yandex-inclusive options disabled with an honest hint when the platform has
 * no Yandex keys, nothing editable until the setting is read, and the save
 * outcome reported as a toast.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const readSource = readFileSync(join(SRC, "routes/settings/customer-login/customer-login.tsx"), "utf8")
const editSource = readFileSync(
  join(SRC, "routes/settings/customer-login/customer-login-edit/customer-login-edit.tsx"),
  "utf8"
)
const hookSource = readFileSync(join(SRC, "hooks/api/login-settings.tsx"), "utf8")
const ru = JSON.parse(readFileSync(join(SRC, "i18n/translations/ru.json"), "utf8"))

test("offers exactly the three methods the task named, each backed by its own i18n key", () => {
  assert.ok(editSource.includes('const METHODS = ["email", "yandex", "both"] as const'))
  assert.ok(editSource.includes("label={t(`customerLogin.options.${option}.label`)}"))
  assert.ok(editSource.includes("description={t(`customerLogin.options.${option}.description`)}"))
  for (const value of ["email", "yandex", "both"]) {
    assert.equal(typeof ru.customerLogin.options[value].label, "string", `no label for "${value}"`)
    assert.equal(typeof ru.customerLogin.options[value].description, "string", `no description for "${value}"`)
  }
})

test("the Yandex-inclusive options are disabled without platform keys; email alone is not", () => {
  assert.ok(
    editSource.includes('disabled={option !== "email" && !yandexAvailable}'),
    "yandex and both must be disabled whenever the platform has no Yandex keys; email never"
  )
})

test("the honest hint about missing Yandex keys is conditioned on the same flag that disables the options", () => {
  const hintIndex = editSource.indexOf("customerLogin.yandexUnavailableHint")
  assert.notEqual(hintIndex, -1, "the hint must exist")

  const before = editSource.slice(Math.max(0, hintIndex - 200), hintIndex)
  assert.ok(
    before.includes("!yandexAvailable"),
    "the hint must render exactly when the Yandex options are disabled for that reason, not unconditionally"
  )
})

test("the read page shows the platform's Yandex state as a grey badge with the same reason", () => {
  assert.ok(readSource.includes('{ color: "grey", label: t("customerLogin.yandex.off") }'))
  assert.ok(readSource.includes('hint: yandexAvailable ? undefined : t("customerLogin.yandex.offHint")'))
  assert.equal(ru.customerLogin.yandex.off, "не подключён на платформе")
})

test("yandexAvailable comes from the backend's own platform flag, never guessed on the panel side", () => {
  for (const source of [readSource, editSource]) {
    assert.ok(
      source.includes("saved?.yandex_platform_available"),
      "availability must be read from the backend response (whether YANDEX_CLIENT_ID is set), not hardcoded"
    )
  }
})

test("nothing is editable until the setting is read: the drawer's form mounts after the load", () => {
  assert.ok(editSource.includes("isPending={isPending}"), "the drawer must wait for the saved method")
  assert.ok(readSource.includes("isPending={isPending}"), "the read page must be a skeleton until then")
  assert.ok(!readSource.includes("<RadioGroup"), "the choice is no longer on the page itself")
})

test("a save reports its own outcome as a toast through the shared drawer", () => {
  assert.ok(editSource.includes('successMessage={t("customerLogin.saved")}'), "a successful save must toast")
  assert.ok(editSource.includes("onSubmit={(values) => mutateAsync(values)}"), "a refusal must reach the drawer's toast.error")
})

test("the setting round-trips through GET/PUT /tenants/login-settings, one field, no per-field merge", () => {
  assert.ok(hookSource.includes('"/tenants/login-settings"'), "the hook must call the tenant's own login-settings route")
  assert.ok(hookSource.includes('method: "PUT"'), "saving must PUT, not POST")
})
