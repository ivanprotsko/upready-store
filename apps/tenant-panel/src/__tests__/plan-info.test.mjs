import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-27-05 (Ivan 2026-09-27: «работающий онбординг для всех тарифов с
 * сохраннением выбранного тарифа в личном кабинете и триальной версией для
 * платных тарифов»): the Home page names the shop's own tariff and, for a
 * trial, its end date — read off `GET /tenants/me`, no payment UI.
 *
 * Source-text assertions, not a render: this package ships `node --test`, no
 * jsdom/React Testing Library dependency (same reason `profile-password.test.mjs`
 * gives).
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

test("Home renders PlanInfo next to the shop name", () => {
  const home = read("routes/home/home.tsx")
  assert.ok(home.includes("import { PlanInfo }"), "home.tsx does not import PlanInfo")
  assert.ok(home.includes("<PlanInfo tenant={tenant} />"), "home.tsx does not render <PlanInfo tenant={tenant} />")
})

test("PlanInfo reads plan_id/plan_trial_ends_at and renders nothing without a plan_id", () => {
  const source = read("routes/home/plan-info.tsx")
  assert.ok(source.includes("plan_id"), "PlanInfo does not read plan_id")
  assert.ok(source.includes("plan_trial_ends_at"), "PlanInfo does not read plan_trial_ends_at")
  assert.ok(/if \(!tenant\?\.plan_id\)\s*{\s*return null/.test(source), "PlanInfo does not bail out to null when plan_id is absent")
  assert.ok(!/card|Оплата|payment/i.test(source), "PlanInfo must carry no payment UI or wording")
})

test("the tenant contract's hand-kept mirror carries plan_id and plan_trial_ends_at", () => {
  const source = read("hooks/api/users.tsx")
  const tenantBlock = source.slice(source.indexOf("tenant: {"), source.indexOf("tenant: {") + 700)
  assert.ok(tenantBlock.includes("plan_id: string | null"), "TenantAdmin.tenant is missing plan_id")
  assert.ok(tenantBlock.includes("plan_trial_ends_at: string | null"), "TenantAdmin.tenant is missing plan_trial_ends_at")
})

test("ru and en carry the same plan translation keys", () => {
  const ru = JSON.parse(read("i18n/translations/ru.json"))
  const en = JSON.parse(read("i18n/translations/en.json"))
  for (const dict of [ru, en]) {
    assert.ok(typeof dict.overview.plan === "string", "overview.plan is missing")
    assert.ok(typeof dict.overview.planTrialUntil === "string", "overview.planTrialUntil is missing")
    for (const id of ["novice", "pro", "master"]) {
      assert.ok(typeof dict.overview.planNames[id] === "string", `overview.planNames.${id} is missing`)
    }
  }
})
