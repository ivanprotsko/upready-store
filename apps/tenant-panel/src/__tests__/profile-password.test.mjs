import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * o24-owner-profile (t-2026-09-24-n3): Ivan's order folded the standing
 * password card into a «Пароль» row (button «Изменить») that opens a side
 * drawer, and required every password field in the panel and on the login
 * screen to read "Показать/Скрыть пароль" instead of `@medusajs/ui`'s
 * hardcoded English. This is a regression test for both.
 *
 * WHY SOURCE TEXT AND NOT A RENDER. Same reason as `nav-routes.test.mjs` and
 * `owner-routes-manifest.test.mjs`: this package ships `node --test`
 * (package.json `"test"`), not vitest — there is no jsdom/React Testing
 * Library dependency and no config for one anywhere in `apps/tenant-panel`.
 * Adding that runner is a separate infrastructure decision, not something a
 * one-screen task should introduce by itself, so this follows the
 * convention the two existing tests in this file already use.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

test("the profile card no longer renders the standing ChangePasswordSection", () => {
  assert.ok(
    !existsSync(
      join(SRC, "routes/profile/profile-detail/components/change-password-section")
    ),
    "change-password-section should be deleted, not merely unused"
  )

  const detail = read("routes/profile/profile-detail/profile-detail.tsx")
  assert.ok(
    !detail.includes("ChangePasswordSection"),
    "profile-detail.tsx still references the removed ChangePasswordSection"
  )
})

test("the profile card's «Пароль» row opens the password drawer route", () => {
  const section = read(
    "routes/profile/profile-detail/components/profile-general-section/profile-general-section.tsx"
  )
  assert.ok(
    section.includes('t("profile.fields.passwordLabel")'),
    "the card is missing the «Пароль» row label"
  )
  assert.ok(
    section.includes('to="password"') && section.includes('t("actions.change")'),
    "the card is missing an «Изменить» link to the password drawer"
  )
})

test("/settings/profile/password is registered next to /settings/profile/edit", () => {
  const app = read("app.tsx")
  const profileRouteBlock = app.slice(
    app.indexOf('path: "/settings/profile"'),
    app.indexOf('path: "/settings/profile"') + 600
  )
  assert.ok(
    profileRouteBlock.includes('path: "password"') &&
      profileRouteBlock.includes("./routes/profile/password-edit"),
    "app.tsx does not nest a \"password\" child route under /settings/profile"
  )
})

test("every password field in login and profile uses the Russian PasswordInput", () => {
  const filesThatMustUsePasswordInput = [
    "routes/login/components/email-pass-login.tsx",
    "routes/profile/password-edit/components/change-password-form/change-password-form.tsx",
  ]

  for (const relativePath of filesThatMustUsePasswordInput) {
    const source = read(relativePath)
    assert.ok(
      source.includes("PasswordInput"),
      `${relativePath} should use the Russian PasswordInput, not @medusajs/ui's Input`
    )
    assert.ok(
      !/<Input\b[^>]*type="password"/.test(source),
      `${relativePath} still renders @medusajs/ui's Input with type="password" (English "Show password")`
    )
  }
})
