import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (release stand 14.10, Ivan on Маркетинг → Акции →
 * «Кампании»: «как этим пользоваться?»). The list says in one sentence what a
 * campaign is and how to fill it: under the heading when there are campaigns,
 * in the empty state with «Создать» when there are none, never both at once.
 * The sentence names two ways to add a promotion, so both are checked here,
 * and the promotion card it sends the owner to speaks Russian. This package
 * cannot render JSX, so the contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const backend = (path) => readFileSync(join(SRC, "..", "..", "backend", "src", "api", "tenants", path), "utf8")

const list = read("routes/campaigns/campaign-list/components/campaign-list-table.tsx")
const dataTable = read("components/table/data-table/data-table.tsx")
const app = read("app.tsx")
const campaignPromotions = read("routes/campaigns/campaign-detail/components/campaign-promotion-section/campaign-promotion-section.tsx")
const promotionCampaign = read("routes/promotions/promotion-detail/components/campaign-section/campaign-section.tsx")
const promotionAddCampaign = read("routes/promotions/promotion-add-campaign/components/add-campaign-promotion-form/add-campaign-promotion-form.tsx")
const campaignsApi = read("hooks/api/campaigns.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

test("the sentence is the lead's, in ru, and has an en twin without a dash", () => {
  assert.equal(
    ru.campaigns.subtitle,
    "Кампания объединяет акции общим сроком и бюджетом. Создайте кампанию, затем добавьте в неё акции — на странице кампании или в карточке акции."
  )
  assert.equal(typeof en.campaigns.subtitle, "string")
  assert.ok(en.campaigns.subtitle.includes("promotion"))
  assert.ok(!en.campaigns.subtitle.includes("—"), "no em dash in English prose (AGENTS.md, Writing)")
})

test("with campaigns, the sentence stands under «Кампании»; while loading and with none, it does not", () => {
  const header = list.slice(list.indexOf('<Heading level="h1">'), list.indexOf('<Link to="/campaigns/create"'))
  assert.ok(header.includes('{t("campaigns.subtitle")}'), "the subtitle sits under the heading")
  assert.ok(header.includes("{isLoading || noCampaigns ? null : ("), "hidden while loading and on the empty list")
  assert.match(
    list,
    /const noCampaigns =\s*count === 0 && Object\.values\(raw\)\.filter\(\(v\) => Boolean\(v\)\)\.length === 0/,
    "«no campaigns» is _DataTable's own no-records test: no rows and no search, filter or sort"
  )
  assert.ok(
    dataTable.includes("const noRecords = !isLoading && count === 0 && noQuery") &&
      dataTable.includes("Object.values(queryObject).filter((v) => Boolean(v)).length === 0"),
    "the table's empty state uses the same test, so the sentence is drawn exactly once"
  )
})

test("with none, the empty state says the same sentence and offers «Создать»", () => {
  const empty = list.slice(list.indexOf("noRecords={{"), list.indexOf("}}", list.indexOf("noRecords={{")))
  assert.ok(empty.includes('title: t("campaigns.list.empty.heading")'))
  assert.ok(empty.includes('message: t("campaigns.subtitle")'))
  assert.ok(empty.includes('action: { to: "/campaigns/create", label: t("actions.create") }'))
  assert.ok(dataTable.includes("action?: { to: string; label: string }"), "_DataTable passes the button through to NoRecords")
  assert.equal(ru.campaigns.list.empty.heading, "Нет кампаний")
})

test("way one: the campaign page adds promotions to the campaign", () => {
  assert.ok(app.includes('path: "add-promotions",'), "the route is registered under /campaigns/:id")
  assert.ok(campaignPromotions.includes("to={`/campaigns/${campaign.id}/add-promotions`}"))
  assert.ok(campaignsApi.includes("`/tenants/campaigns/${id}/promotions`"))
  const route = backend("campaigns/[id]/promotions/route.ts")
  assert.ok(route.includes("export const POST"))
  assert.ok(route.includes("addOrRemoveCampaignPromotionsWorkflow"))
  assert.ok(route.includes("assertOwnedPromotions"), "only the shop's own promotions")
})

test("way two: the promotion card puts the promotion into a campaign", () => {
  assert.ok(app.includes('path: "add-to-campaign",'), "the route is registered under /promotions/:id")
  assert.ok(promotionCampaign.includes('to: "add-to-campaign"'), "«…» → Изменить")
  assert.ok(promotionCampaign.includes("to: `/promotions/${id}/add-to-campaign`"), "the empty state's button")
  assert.ok(promotionAddCampaign.includes("{ campaign_id: data.campaign_id }"))
  const route = backend("promotions/[id]/route.ts")
  assert.ok(route.includes("assertOwnedCampaign(req, rest.campaign_id)"), "only into the shop's own campaign")
})

test("the promotion card's empty «Кампания» speaks the panel's language, not hard-coded English", () => {
  for (const literal of ["Not part of a campaign", "Add this promotion to an existing campaign", "Add to Campaign"]) {
    assert.ok(!promotionCampaign.includes(literal), `hard-coded «${literal}»`)
  }
  for (const key of ["title", "message", "action"]) {
    assert.ok(promotionCampaign.includes(`t("promotions.campaign.empty.${key}")`), `the empty state reads ${key}`)
    assert.equal(typeof ru.promotions.campaign.empty[key], "string", `ru promotions.campaign.empty.${key}`)
    assert.equal(typeof en.promotions.campaign.empty[key], "string", `en promotions.campaign.empty.${key}`)
  }
  assert.ok(/[А-Яа-я]/.test(ru.promotions.campaign.empty.title))
})
