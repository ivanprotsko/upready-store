import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G2): `/settings/sites` and
 * `/settings/domains` rebuilt after the prototype «G2 · Список и карточка».
 * Sites: a list (`_DataTable`), a card per site on `:id`, «Создать сайт» in a
 * focus modal on `create`, the sister sites in a drawer on `:id/sisters/edit`.
 * Domains: one card of two sections, «Сменить адрес» and «Добавить домен» in
 * drawers on `change` and `add`, removal behind `usePrompt`. This package
 * cannot render JSX (the note every panel test here carries), so the contract
 * is asserted on the source, the way `settings-detail-edit-drawer.test.mjs`
 * does for G1.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const sitesList = read("routes/settings/sites/sites.tsx")
const siteDetail = read("routes/settings/sites/site-detail/site-detail.tsx")
const siteCrumb = read("routes/settings/sites/site-detail/breadcrumb.tsx")
const siteCreate = read("routes/settings/sites/site-create/site-create.tsx")
const sistersEdit = read("routes/settings/sites/site-sisters-edit/site-sisters-edit.tsx")
const certificate = read("routes/settings/sites/certificate-status.ts")
const domains = read("routes/settings/domains/domains.tsx")
const domainChange = read("routes/settings/domains/domain-change/domain-change.tsx")
const domainAdd = read("routes/settings/domains/domain-add/domain-add.tsx")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const FILES = {
  sitesList,
  siteDetail,
  siteCrumb,
  siteCreate,
  sistersEdit,
  certificate,
  domains,
  domainChange,
  domainAdd,
}

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

/** The source without its comments, so a «…» in a comment is not a literal on screen. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const slice = (source, from, to) => {
  const start = source.indexOf(from)
  assert.ok(start !== -1, `missing ${from}`)
  const end = to ? source.indexOf(to, start + from.length) : source.length
  return source.slice(start, end === -1 ? source.length : end)
}

// ── the read pages: nothing is edited on them (E2, E13, rule 1) ─────────────

test("the sites list, the site card and the domains card carry no form, field or save of their own", () => {
  for (const [name, source] of Object.entries({ sitesList, siteDetail, domains })) {
    for (const forbidden of ["<form", "<Input", "<Textarea", "<Select", "<Checkbox", "actions.save", "type=\"submit\"", "useCreateSite", "useCreateDomain", "useChangeHandle", "useUpdateHreflangSisters"]) {
      assert.ok(!source.includes(forbidden), `${name} must not carry ${forbidden}`)
    }
  }
})

test("the read pages keep their outlet, so the nested drawer or modal opens over them", () => {
  assert.ok(sitesList.includes("<SingleColumnPage widgets={{ before: [], after: [] }}>"), "the list renders the outlet (hasOutlet defaults to true)")
  assert.ok(!sitesList.includes("hasOutlet={false}"))
  assert.ok(siteDetail.includes("<SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>"))
  assert.ok(domains.includes("<SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>"))
})

// ── /settings/sites: a list (E1, E10) ───────────────────────────────────────

test("the sites list is a Container with its header and one «Создать сайт» button, then _DataTable", () => {
  assert.ok(sitesList.includes('<Heading level="h1">{t("sites.title")}</Heading>'), "the screen's h1 is the list header (E11)")
  assert.ok(sitesList.includes('<Link to="create">'), "the header button opens the create modal on its own route")
  assert.ok(sitesList.includes('<Button size="small" variant="secondary">'))
  assert.ok(sitesList.includes("<_DataTable"))
  assert.ok(sitesList.includes("navigateTo={(row) => row.id}"), "the whole row opens the site's card")
  assert.ok(sitesList.includes("pagination={false}"), "a list of a few sites draws no «1 — 2 из 2» footer")
})

test("the list columns are the prototype's: name (+ «Этот сайт»), main address, domains, certificate", () => {
  for (const key of ["sites.columns.name", "sites.columns.primaryHost", "sites.columns.domains", "sites.columns.certificate"]) {
    assert.ok(sitesList.includes(`header: t("${key}")`), `column ${key}`)
  }
  assert.ok(sitesList.includes('<StatusBadge color="blue">{t("sites.current")}</StatusBadge>'))
  assert.ok(sitesList.includes("{row.original.domains.length}"))
  assert.ok(sitesList.includes("certificateStatus(certificate, { short: true })"), "the column says «Действует до …», not «Сертификат до …» under «Сертификат»")
})

test("a row's «…» holds only «Перейти на сайт», through the existing switcher, and the current site has none", () => {
  const actions = slice(sitesList, "const SiteRowActions", "const SiteCertificateBadge")
  assert.ok(actions.includes("if (site.is_current) {\n    return null\n  }"))
  assert.ok(actions.includes('label: t("sites.open")'))
  assert.ok(actions.includes("switchShop({ tenant_id: site.id })"))
  assert.ok(actions.includes("useSwitchShop"))
  assert.equal(ru.sites.open, "Перейти на сайт")
})

test("the sister sites are gone from the list: they belong to one site's card", () => {
  assert.ok(!sitesList.includes("useHreflangSisters"))
  assert.ok(!sitesList.includes("sites.sisters."))
})

// ── /settings/sites/:id: the card (E2) ──────────────────────────────────────

test("the site card reads three sections: general, domains, and the sisters on this site only", () => {
  assert.ok(siteDetail.includes("<GeneralSection site={site} />"))
  assert.ok(siteDetail.includes("<DomainsSection site={site} />"))
  assert.ok(siteDetail.includes("{site.is_current ? <SistersSection /> : null}"), "the sisters are this site's, not every site's")
  assert.ok(siteDetail.includes('<SettingsDetailSection section={section} level="h1" />'), "the site name is the card's h1 (E11)")
})

test("the card needs no request of its own and answers «not found» for a foreign id", () => {
  assert.ok(siteDetail.includes("const { sites, isPending, isError, error } = useSites()"))
  assert.ok(siteDetail.includes("sites.find((candidate) => candidate.id === id)"))
  assert.ok(siteDetail.includes('throw new FetchError(id ?? "", "Not Found", 404)'))
  assert.ok(siteDetail.includes("<SingleColumnPageSkeleton sections={3} />"), "until the answer the card is a skeleton (rule 12)")
  assert.ok(siteCrumb.includes("useSites()"), "the crumb reads the site's name from the same list")
})

test("the general section: name, main address, platform address with its certificate, what is shared", () => {
  const general = slice(siteDetail, "const GeneralSection", "const DomainsSection")
  for (const key of ["sites.detail.name", "sites.detail.primaryHost", "sites.detail.platformHost", "sites.detail.shared", "sites.detail.sharedValue", "sites.certificate.platform"]) {
    assert.ok(general.includes(`t("${key}")`), key)
  }
  assert.ok(general.includes("actions: site.is_current\n      ? []"), "this site's card has nothing to do in «…»: the platform has no rename")
  assert.ok(general.includes('label: t("sites.open")'), "another site's card keeps «Перейти на сайт»")
})

test("the domains section reads each host's certificate and links to «Адрес магазина», the one screen that manages them", () => {
  const section = slice(siteDetail, "const DomainsSection", "const SistersSection")
  assert.ok(section.includes("certificateStatus(domain.certificate)"))
  assert.ok(section.includes("<SectionRow"))
  assert.ok(section.includes('to="/settings/domains"'), "a CrossLink, not «см. ниже» text")
  assert.ok(section.includes("{site.is_current ? ("), "another site's domains are managed after switching to it")
  assert.ok(!section.includes("useDeleteDomain") && !section.includes("useSetPrimaryDomain"), "no domain operation lives on two screens")
})

test("the sisters section keeps Ivan's one-phrase reason and opens its drawer on `sisters/edit`", () => {
  const section = slice(siteDetail, "const SistersSection", "export const SiteDetail")
  assert.ok(section.includes('editTo: "sisters/edit"'))
  assert.equal(ru.sites.sisters.title, "Сайты-сёстры на других серверах")
  assert.equal(
    ru.sites.sisters.description,
    "Для поиска: тот же магазин на другом сервере, чтобы Google и Яндекс считали его переводом, а не копией."
  )
  assert.ok(section.includes('t("sites.sisters.empty")'), "no sister reads as a row that says why that is fine")
})

// ── /settings/sites/create: a focus modal (E4) ──────────────────────────────

test("«Создать сайт» is RouteFocusModal + RouteFocusModal.Form + KeyboundForm with a Title", () => {
  for (const piece of ["<RouteFocusModal>", "<RouteFocusModal.Form form={form}>", "<KeyboundForm", "<RouteFocusModal.Title asChild>", "<RouteFocusModal.Footer>"]) {
    assert.ok(siteCreate.includes(piece), `missing ${piece}`)
  }
  assert.ok(siteCreate.includes("zodResolver("), "the form validates with zod")
})

test("the create modal has the same fields as before: name, handle, two copy flags, what is not copied", () => {
  for (const name of ['name="name"', 'name="handle"', '"copy_pages", "copy_shipping"']) {
    assert.ok(siteCreate.includes(name), name)
  }
  assert.ok(siteCreate.includes("<Checkbox"))
  assert.ok(siteCreate.includes('t("sites.create.notCopied")'))
  assert.ok(siteCreate.includes("HANDLE_PATTERN.test(value)"), "the handle is checked in the form, its error under the field")
})

test("one «Отмена / Создать сайт» pair; a refusal toasts the platform's text and stays, success toasts and closes", () => {
  const footer = slice(siteCreate, "<RouteFocusModal.Footer>", "</RouteFocusModal.Footer>")
  assert.ok(footer.includes("<RouteFocusModal.Close asChild>"))
  assert.ok(footer.includes('t("actions.cancel")'))
  assert.ok(footer.includes('type="submit"') && footer.includes('t("sites.create.submit")'))
  const submit = slice(siteCreate, "form.handleSubmit", "return (")
  const errorAt = submit.indexOf("toast.error(")
  const returnAt = submit.indexOf("return", errorAt)
  const successAt = submit.indexOf('toast.success(t("sites.created"')
  assert.ok(errorAt !== -1 && returnAt < successAt, "a refusal must not fall through to the success toast")
  assert.ok(submit.indexOf("handleSuccess()") > successAt)
})

// ── /settings/sites/:id/sisters/edit: the shared drawer ─────────────────────

test("the sisters drawer is SettingsEditDrawer with a field array, and a blank domain is dropped on save", () => {
  assert.ok(sistersEdit.includes("<SettingsEditDrawer"))
  assert.ok(sistersEdit.includes('useFieldArray({ control: form.control, name: "sisters" })'))
  assert.ok(sistersEdit.includes("values.sisters.filter((sister) => sister.domain.length > 0)"))
  assert.ok(sistersEdit.includes("isPending={isPending}"), "the form mounts once the saved list is read")
  assert.ok(sistersEdit.includes('aria-label={t("sites.sisters.remove")}'), "the remove icon button has a name (DS «Запрещено»)")
  assert.ok(sistersEdit.includes("<Select "), "the language is the ui Select, not a native <select>")
})

// ── /settings/domains: one card of two sections ─────────────────────────────

test("«Адрес магазина» reads the three addresses and hides «Сменить адрес» behind «…» → `change`", () => {
  assert.ok(domains.includes('title: t("tenantAddress.title")'))
  assert.ok(domains.includes('level="h1"'))
  for (const key of ["tenantAddress.primaryLabel", "tenantAddress.technicalLabel", "tenantAddress.inSearch", "tenantAddress.previousHint", "tenantAddress.technicalHint"]) {
    assert.ok(domains.includes(`t("${key}")`), key)
  }
  assert.ok(domains.includes('t("tenantAddress.previousLabel", { count: previous.length })'))
  assert.ok(domains.includes('label: t("tenantAddress.changeAction"),\n                  to: "change"'))
})

test("«Свои домены» is a _DataTable with one header button, and an empty list is NoRecords with that one button", () => {
  const section = slice(domains, "const CustomDomainsSection", "export const Domains")
  assert.ok(section.includes("<_DataTable"))
  assert.ok(section.includes('<Link to="add">'))
  assert.ok(section.includes("<NoRecords"))
  assert.ok(section.includes('action={{ to: "add", label: t("tenantAddress.addDomainTitle") }}'))
  assert.ok(section.includes("{rows.length ? ("), "the header button and the table give way to the empty state")
})

test("a domain's state comes from the live certificate of GET /tenants/sites, joined by host", () => {
  const section = slice(domains, "const CustomDomainsSection", "export const Domains")
  assert.ok(section.includes("useSites()"))
  assert.ok(section.includes("sites?.find((site) => site.is_current)?.domains"))
  assert.ok(section.includes("certificates.get(domain.host)"))
  const state = slice(domains, "const DomainState", "const DomainRowActions")
  assert.ok(state.includes('<StatusBadge color="green">{t("tenantAddress.inSearch")}</StatusBadge>'), "the main domain reads «В поиске»")
  assert.ok(state.includes("certificateStatus(domain.certificate)"))
})

test("«Сделать основным» and «Удалить» are the row's «…», the removal last and behind usePrompt naming the host (E6, rule 8)", () => {
  const actions = slice(domains, "const DomainRowActions", "const columnHelper")
  const promptAt = actions.indexOf("await prompt({")
  const deleteAt = actions.indexOf("deleteDomain(domain.id")
  assert.ok(promptAt !== -1 && deleteAt > promptAt, "the domain is removed only after the prompt")
  assert.ok(actions.includes('description: t("tenantAddress.removeWarning", { host })'))
  assert.ok(actions.includes("if (!confirmed) {\n      return\n    }"))
  const makeAt = actions.indexOf('t("tenantAddress.makePrimary")')
  const removeAt = actions.indexOf('label: t("actions.delete")')
  assert.ok(makeAt !== -1 && removeAt > makeAt, "the dangerous group is the last one")
  assert.ok(actions.includes("domain.is_primary\n        ? []"), "the main domain is not offered to become main again")
  assert.ok(!/<IconButton[^>]*>\s*<Trash/.test(domains), "no trash icon button in the row any more")
})

test("every «…» icon button of the G2 rows has an accessible name (DS «Запрещено»)", () => {
  for (const [name, source] of Object.entries({ sitesList, domains })) {
    assert.ok(source.includes('<IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>'), name)
    assert.ok(!source.includes("<ActionMenu groups={groups.filter((group) => group.actions.length)} />"), `${name}: the default trigger has no name`)
  }
})

// ── the two domain drawers (E3, E5) ─────────────────────────────────────────

test("both domain drawers are RouteDrawer + RouteDrawer.Form + KeyboundForm with a Title", () => {
  for (const [name, source] of Object.entries({ domainChange, domainAdd })) {
    for (const piece of ["<RouteDrawer>", "<RouteDrawer.Form form={form}>", "<KeyboundForm", "<RouteDrawer.Title asChild>", "<RouteDrawer.Footer>", "zodResolver("]) {
      assert.ok(source.includes(piece), `${name}: missing ${piece}`)
    }
  }
})

test("each drawer has one «Отмена» and one submit named after the operation, in the footer", () => {
  for (const [name, source, submitKey] of [
    ["change", domainChange, "tenantAddress.changeAction"],
    ["add", domainAdd, "tenantAddress.addDomain"],
  ]) {
    const footer = slice(source, "<RouteDrawer.Footer>", "</RouteDrawer.Footer>")
    assert.ok(footer.includes("<RouteDrawer.Close asChild>"), name)
    assert.equal((source.match(/t\("actions\.cancel"\)/g) ?? []).length, 1, `${name}: one «Отмена»`)
    assert.equal((source.match(/type="submit"/g) ?? []).length, 1, `${name}: one submit`)
    assert.ok(footer.includes(`t("${submitKey}")`), `${name}: the submit names the operation`)
    assert.ok(!source.includes("actions.save"), `${name}: nothing on the screen was edited, so no «Сохранить»`)
  }
})

test("each drawer toasts a refusal with the platform's text and stays; success toasts, then returns", () => {
  for (const [name, source] of Object.entries({ domainChange, domainAdd })) {
    const submit = slice(source, "form.handleSubmit", "return (")
    const errorAt = submit.indexOf("toast.error(error instanceof Error ? error.message")
    const returnAt = submit.indexOf("return", errorAt)
    const successAt = submit.indexOf("toast.success(")
    assert.ok(errorAt !== -1 && returnAt < successAt, `${name}: a refusal must not fall through`)
    assert.ok(submit.indexOf("handleSuccess()") > successAt, `${name}: toast first, then back`)
  }
})

test("«Сменить адрес» keeps the five consequences in front of the owner until she presses the button", () => {
  const list = slice(domainChange, "const WARNINGS = [", "] as const")
  const keys = [...list.matchAll(/"(warning[A-Za-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(keys, ["warningNewWorks", "warningOldRedirects", "warningReindex", "warningReserved", "warningRepeat"])
  assert.ok(domainChange.includes("{t(`tenantAddress.${key}`)}"))
  assert.ok(domainChange.includes(".refine((value) => value !== current"), "the current handle is not a change")
})

test("«Добавить домен» carries the registrar steps in order, with the CNAME target", () => {
  const list = slice(domainAdd, "const STEPS = [", "] as const")
  assert.deepEqual([...list.matchAll(/"(dnsStep\d)"/g)].map((m) => m[1]), ["dnsStep1", "dnsStep2", "dnsStep3", "dnsStep4"])
  assert.ok(domainAdd.includes("t(`tenantAddress.${key}`, { target: CNAME_TARGET })"))
  assert.ok(ru.tenantAddress.dnsStep2.includes("{{target}}") && en.tenantAddress.dnsStep2.includes("{{target}}"))
  assert.ok(!domains.includes("CNAME_TARGET"), "the instruction left the page")
})

// ── router and manifest (rule 16) ───────────────────────────────────────────

test("app.tsx nests the new routes next to the existing ones", () => {
  for (const module of [
    "./routes/settings/domains/domain-change",
    "./routes/settings/domains/domain-add",
    "./routes/settings/sites/site-create",
    "./routes/settings/sites/site-detail",
    "./routes/settings/sites/site-sisters-edit",
  ]) {
    assert.ok(app.includes(`"${module}"`), `app.tsx lazy-loads ${module}`)
  }
  for (const path of ['path: "change"', 'path: "add"', 'path: "create"', 'path: ":id"', 'path: "sisters/edit"']) {
    assert.ok(app.includes(path), path)
  }
  assert.ok(app.includes("breadcrumb: (match: UIMatch) => <Breadcrumb {...match} />"), "the card's crumb is the site name")
})

test("every new address is in e2e/owner-routes.mjs, drawers and modals as overlays", () => {
  for (const line of [
    '{ path: "/settings/domains/change", kind: "overlay" }',
    '{ path: "/settings/domains/add", kind: "overlay" }',
    '{ path: "/settings/sites/create", kind: "overlay" }',
    '{ path: "/settings/sites/:site_id" }',
    '{ path: "/settings/sites/:site_id/sisters/edit", kind: "overlay" }',
  ]) {
    assert.ok(ownerRoutes.includes(line), line)
  }
  assert.ok(ownerRoutes.includes('const { sites } = await api("/tenants/sites")'), "the walker resolves :site_id from the stand")
})

// ── strings (rules 6, 7, 14) ────────────────────────────────────────────────

test("every i18n key the G2 screens read exists in ru.json and en.json", () => {
  const keys = new Set(
    Object.values(FILES).flatMap((source) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  // The keys built from a list, read through a template string.
  for (const key of ["warningNewWorks", "warningOldRedirects", "warningReindex", "warningReserved", "warningRepeat", "dnsStep1", "dnsStep2", "dnsStep3", "dnsStep4"]) {
    keys.add(`tenantAddress.${key}`)
  }
  for (const status of ["invalid", "unreachable"]) {
    keys.add(`sites.certificate.${status}`)
  }
  assert.ok(keys.size > 80, `expected the screens' keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("no literal reaches the owner from the G2 screens: no defaultValue fallback, no Cyrillic in code", () => {
  for (const [name, source] of Object.entries(FILES)) {
    assert.ok(!source.includes("defaultValue:"), `${name}: a defaultValue fallback is a literal on screen`)
    assert.ok(!/[А-Яа-яЁё]/.test(code(source)), `${name}: a Russian literal outside a comment`)
  }
})

test("«Прежний адрес» agrees with its count in Russian plural forms", () => {
  for (const form of ["one", "few", "many", "other"]) {
    assert.equal(typeof ru.tenantAddress[`previousLabel_${form}`], "string", `ru plural form ${form}`)
  }
  assert.equal(ru.tenantAddress.previousLabel_one, "Прежний адрес")
  assert.equal(ru.tenantAddress.previousLabel_few, "Прежние адреса")
})

test("certificate dates go through getFullDate, one format for the panel (rule 14)", () => {
  assert.ok(certificate.includes("getFullDate({ date: certificate.valid_to })"))
  for (const [name, source] of Object.entries(FILES)) {
    assert.ok(!source.includes("toLocaleDateString"), `${name}: a date outside getFullDate`)
  }
})

test("the strings of the old inline screens are gone with them", () => {
  for (const key of ["sites.sisters.submit", "tenantAddress.cancel", "tenantAddress.cname", "tenantAddress.customHint", "tenantAddress.previousBadge", "tenantAddress.technicalBadge", "tenantAddress.primaryHint"]) {
    assert.equal(lookup(ru, key), undefined, `ru still has ${key}`)
    assert.equal(lookup(en, key), undefined, `en still has ${key}`)
  }
})
