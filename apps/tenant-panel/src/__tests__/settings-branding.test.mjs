import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G1 part 4): `/settings/branding`
 * rebuilt on `SettingsDetail` + three `SettingsEditDrawer`s on the nested
 * routes `logo/edit`, `icons/edit`, `color/edit`. This package cannot render
 * JSX (no vitest/jsdom, see `settings-detail-edit-drawer.test.mjs`), so the
 * contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const branding = (file) => read(`routes/settings/branding/${file}`)

const page = branding("branding.tsx")
const hook = branding("use-branding-edit.ts")
const slot = branding("upload-slot.tsx")
const colorInput = branding("color-input.tsx")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const DRAWERS = {
  "logo/edit": { file: "logo-edit.tsx", hook: "useLogoEdit", fields: ["logo_light_url", "logo_dark_url", "shop_name_short", "og_image_url"] },
  "icons/edit": { file: "icons-edit.tsx", hook: "useIconsEdit", fields: ["favicon_url", "app_icons"] },
  "color/edit": { file: "color-edit.tsx", hook: "useColorEdit", fields: ["primary_color", "footer_credit"] },
}

// Every field `PUT /tenants/branding` takes: the checklist of «nothing is lost».
const RECORD = [
  "logo_light_url", "logo_dark_url", "favicon_url", "og_image_url", "primary_color",
  "shop_name_short", "footer_credit", "app_icons",
]

const hookBody = (name) => {
  const start = hook.indexOf(`export const ${name} =`)
  const end = hook.indexOf("\nexport ", start + 1)
  return hook.slice(start, end === -1 ? undefined : end)
}
const putOf = (name) => {
  const body = hookBody(name)
  return body.slice(body.indexOf("put("), body.indexOf("return {", body.indexOf("put(")))
}

// ── the read page ───────────────────────────────────────────────────────────

test("the page only reads: a SettingsDetail with three sections, no form, no save, no upload", () => {
  assert.ok(page.includes("<SettingsDetail"))
  for (const forbidden of ["<form", "<Input", "<Switch", "<Button", "mutateAsync", "useUpdateTenantBranding", "toast.", "actions.save", "<UploadSlot", "type=\"file\"", "type=\"color\""]) {
    assert.ok(!page.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
})

test("sections come in the prototype's order, each opening its own drawer", () => {
  const order = ["logo", "icons", "color"].map((id) => page.indexOf(`id: "${id}"`))
  assert.ok(order.every((at) => at !== -1), "three sections: logo, icons, color")
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  for (const route of Object.keys(DRAWERS)) {
    assert.ok(page.includes(`editTo: "${route}"`), `a section opens ${route}`)
  }
})

test("the screen and its first section are «Оформление», as the menu item (Ivan's fork 3)", () => {
  assert.equal(ru.brandingSettings.title, "Оформление")
  assert.equal(ru.brandingSettings.title, ru.app.nav.owner.branding)
  assert.equal(en.brandingSettings.title, en.app.nav.owner.branding)
  assert.ok(page.includes('title: t("brandingSettings.title")'), "the first section's title is the screen's own")
  assert.ok(app.includes('handle: { breadcrumb: () => t("brandingSettings.title") },'), "the breadcrumb reads the key")
  assert.ok(!app.includes('defaultValue: "Бренд"'), "the old «Бренд» fallback is gone from the breadcrumb")
})

test("every row of the prototype is on the page", () => {
  const rows = [
    "logo_light", "logo_dark", "shop_name_short", "og_image",
    "favicon", "icons_preview", "icon_maskable", "icon_mono",
    "primary_color", "header_preview", "footer_credit",
  ]
  for (const id of rows) {
    assert.ok(page.includes(`"${id}"`), `row ${id}`)
  }
})

test("a filled file row is its picture and format, an empty one «—» with a hint", () => {
  assert.ok(page.includes("value: url ? <BrandingFileValue url={url} shape={shape} dark={dark} /> : null"))
  assert.ok(page.includes("hint: url ? hint.filled : hint.empty"))
  assert.ok(page.includes('"logo",\n          { empty: t("brandingSettings.fields.logoDarkHint") },\n          true'), "the dark logo sits on the dark tile")
})

test("the favicon row says whether the set was built; the colour row says how it reads (E7)", () => {
  assert.ok(page.includes('{ color: "green", label: t("brandingSettings.appIcons.built") }'))
  assert.ok(page.includes('{ color: "orange", label: t("brandingSettings.appIcons.notBuilt") }'))
  assert.ok(page.includes("branding?.low_contrast"), "the platform's own contrast answer drives the badge")
  for (const key of ["readsWithWhite", "readsWithBlack", "lowContrast"]) {
    assert.ok(page.includes(`t("brandingSettings.color.${key}")`), `colour badge ${key}`)
  }
  assert.ok(page.includes('{ color: "grey", label: t("brandingSettings.credit.off") }'), "the credit reads «выключена» when off")
})

test("the previews stay on the page: icons and header", () => {
  assert.ok(page.includes("<AppIconsPreview"))
  assert.ok(page.includes("<HeaderPreview"))
})

// ── the three drawers ───────────────────────────────────────────────────────

test("each section edits in a SettingsEditDrawer on its nested route, registered in app.tsx", () => {
  for (const [route, drawer] of Object.entries(DRAWERS)) {
    const source = branding(drawer.file)
    assert.ok(source.includes("<SettingsEditDrawer"), `${drawer.file} must use SettingsEditDrawer`)
    assert.ok(source.includes(`${drawer.hook}()`), `${drawer.file} reads its own section hook`)
    assert.ok(/export \{ \w+ as Component \}/.test(source), `${drawer.file} is a lazy route module`)
    assert.ok(source.includes('successMessage={t("brandingSettings.saved")}'), `${drawer.file}: the save ends in one toast (E9)`)
    const name = drawer.file.replace(".tsx", "")
    assert.ok(
      app.includes(`path: "${route}",\n                lazy: () => import("./routes/settings/branding/${name}"),`),
      `app.tsx must register ${route} as a child of /settings/branding`
    )
  }
})

test("every drawer route has its overlay row in the owner route manifest (DS rule 16)", () => {
  for (const route of Object.keys(DRAWERS)) {
    assert.ok(ownerRoutes.includes(`{ path: "/settings/branding/${route}", kind: "overlay" },`), `owner-routes.mjs: ${route}`)
  }
})

test("each drawer sends only its own fields; every field of the record lives in exactly one drawer", () => {
  const homed = []
  for (const [route, drawer] of Object.entries(DRAWERS)) {
    const put = putOf(drawer.hook)
    const sent = RECORD.filter((field) => new RegExp(`\\b${field}:`).test(put))
    assert.deepEqual(sent.sort(), [...drawer.fields].sort(), `${route} sends ${drawer.fields.join(", ")}`)
    homed.push(...sent)
  }
  assert.deepEqual(homed.sort(), [...RECORD].sort(), "nothing lost, nothing twice")
  assert.ok(hook.includes("mutateAsync(body)"), "one mutation, today's PUT /tenants/branding")
})

test("each drawer sends what the single form sent: trimmed name, empty colour as null, the link trimmed or null", () => {
  assert.ok(putOf("useLogoEdit").includes("shop_name_short: values.shop_name_short.trim() ? values.shop_name_short.trim() : null"))
  assert.ok(putOf("useColorEdit").includes("primary_color: values.primary_color ? values.primary_color : null"))
  assert.ok(putOf("useColorEdit").includes("href: values.credit_href.trim() || null"))
})

test("an upload in flight blocks «Сохранить» with a toast instead of losing the file", () => {
  assert.ok(hook.includes("Promise.reject(new Error(t(\"brandingSettings.file.stillUploading\")))"))
  for (const file of ["logo-edit.tsx", "icons-edit.tsx"]) {
    const source = branding(file)
    assert.ok(source.includes("onSubmit={uploads.guard(save)}"), `${file} guards its save`)
    assert.ok(source.includes("onUploadingChange={uploads.track}") || source.includes("onUploadingChange={onUploadingChange}"), `${file} reports its uploads`)
  }
})

test("the logo drawer keeps all four values, the short name among them", () => {
  const source = branding("logo-edit.tsx")
  for (const kind of ["logo_light", "logo_dark", "og_image"]) {
    assert.ok(source.includes(`kind="${kind}"`), `upload slot ${kind}`)
  }
  assert.ok(source.includes('name="shop_name_short"'))
  assert.ok(source.includes("maxLength={60}"), "the platform's 60-character cap")
})

test("the colour drawer: hex Input with a swatch, the contrast warning, the header preview, the credit switch", () => {
  const source = branding("color-edit.tsx")
  assert.ok(source.includes("<ColorInput {...field} />"))
  assert.ok(source.includes('data-testid="branding-low-contrast"'), "the contrast warning stays")
  assert.ok(source.includes("contrastIsLow(color)"))
  assert.ok(source.includes("<HeaderPreview"), "the header preview stays")
  assert.ok(source.includes('name="credit_enabled"') && source.includes("<SwitchBox"), "the credit is a Switch")
  assert.ok(source.includes('name="credit_text"') && source.includes('name="credit_href"'))
  assert.ok(source.includes("maxLength={200}"), "the platform's 200-character cap on the credit")
  assert.ok(source.includes('path: ["credit_text"], message: messages.creditTextNeeded'), "an enabled credit needs its text")
  assert.ok(source.includes("value === \"\" || HEX_COLOR.test(value)"), "the colour is #RRGGBB or empty")
})

// ── design system: no native controls on screen ────────────────────────────

test("no native file input: the slot is FileUpload's zone and a file row with «Убрать»", () => {
  assert.ok(!slot.includes('type="file"'), "the native file input is gone (DS «Запрещено»)")
  assert.ok(slot.includes("<FileUpload"))
  assert.ok(slot.includes("multiple={false}"))
  assert.ok(slot.includes('t("brandingSettings.remove")'))
  assert.ok(slot.includes("uploadBrandingFile(picked.file, kind)"), "uploads keep today's API")
  assert.ok(slot.includes("onChange(uploaded.file.url, uploaded.app_icons)"), "an icon kind hands up its app_icons")
})

test("no bare native colour input: the system picker sits hidden behind the swatch (Ivan's fork 4)", () => {
  assert.ok(colorInput.includes('type="color"'))
  assert.ok(colorInput.includes("opacity-0") && colorInput.includes("pointer-events-none") && colorInput.includes("aria-hidden"))
  assert.ok(colorInput.includes("onClick={() => pickerRef.current?.click()}"), "the swatch opens the picker")
  assert.ok(colorInput.includes('aria-label={t("brandingSettings.fields.pickColor")}'), "the swatch button has a name")
  assert.ok(colorInput.includes("<Input"), "the hex is typed into Input")
})

// ── catalogs ────────────────────────────────────────────────────────────────

test("no literal Russian string and no default fallback in the screen's code (DS rules 6–7)", () => {
  const files = [
    "branding.tsx", "app-icons.tsx", "upload-slot.tsx", "branding-file.tsx", "header-preview.tsx",
    "color-input.tsx", "logo-edit.tsx", "icons-edit.tsx", "color-edit.tsx", "use-branding-edit.ts",
  ]
  for (const file of files) {
    const source = branding(file)
    // Comments may quote the owner's words; strings the owner reads may not.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-я]{3,}/.test(code), `${file}: a Russian literal in code`)
    assert.ok(!source.includes("defaultValue:"), `${file}: a defaultValue fallback`)
  }
})

test("the ru and en branding catalogs have the same keys", () => {
  const keys = (node, prefix = "") =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    )
  assert.deepEqual(keys(ru.brandingSettings).sort(), keys(en.brandingSettings).sort())
})

test("labels with the form's own «(необязательно)» carry no second one in their text", () => {
  for (const key of ["footerCreditHref"]) {
    assert.ok(!/необязательно/i.test(ru.brandingSettings.fields[key]), `ru fields.${key}`)
  }
  for (const key of ["maskable", "mono"]) {
    assert.ok(!/необязательно/i.test(ru.brandingSettings.appIcons[key]), `ru appIcons.${key}`)
  }
})
