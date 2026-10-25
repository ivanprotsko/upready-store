import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (release stand 14.10, Ivan on `/settings/branding`: «тут
 * наверное лучше сделать сеткой 2х2 вместо строк и сразу поставить
 * плейсхолдеры изображений "заглушки"»). The four pictures, both logos, the
 * social image and the favicon, are one 2×2 grid of tiles; an empty tile or a
 * file that does not load is a grey placeholder with an image icon and «Не
 * загружено», never a broken-image icon; a click opens the existing drawer.
 * The icon set's preview uses the same placeholder. This package cannot render
 * JSX, so the contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const branding = (file) => read(`routes/settings/branding/${file}`)

const page = branding("branding.tsx")
const file = branding("branding-file.tsx")
const preview = branding("app-icons.tsx")
const header = branding("header-preview.tsx")
const detail = read("components/settings/settings-detail/settings-detail.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const TILES = [
  { id: "logo_light", to: "logo/edit", label: "brandingSettings.fields.logoLight", url: "branding?.logo_light_url", shape: "logo" },
  { id: "logo_dark", to: "logo/edit", label: "brandingSettings.fields.logoDark", url: "branding?.logo_dark_url", shape: "logo" },
  { id: "og_image", to: "logo/edit", label: "brandingSettings.fields.ogImage", url: "branding?.og_image_url", shape: "cover" },
  { id: "favicon", to: "icons/edit", label: "brandingSettings.fields.favicon", url: "favicon", shape: "icon" },
]

/** The JSX of one tile on the page, from its tag to its self-closing end. */
const tileOf = (id) => {
  const start = page.indexOf(`id="${id}"`)
  assert.ok(start !== -1, `tile ${id}`)
  return page.slice(page.lastIndexOf("<BrandingImageTile", start), page.indexOf("/>", start))
}

const componentOf = (source, name) => {
  const start = source.indexOf(`export const ${name} =`)
  assert.ok(start !== -1, `${name} is exported`)
  const end = source.indexOf("\nexport ", start + 1)
  return source.slice(start, end === -1 ? undefined : end)
}

test("the four pictures are one grid of two columns, in the order logo, dark logo, social image, favicon", () => {
  const grid = page.slice(page.indexOf('data-testid="branding-image-grid"') - 60, page.indexOf("</div>", page.indexOf('data-testid="branding-image-grid"')))
  assert.ok(grid.includes('className="grid grid-cols-2 gap-2"'), "two columns, two rows")
  const order = TILES.map(({ id }) => grid.indexOf(`id="${id}"`))
  assert.ok(order.every((at) => at !== -1), "all four tiles sit in the grid")
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.equal((grid.match(/<BrandingImageTile/g) ?? []).length, 4)
})

test("each tile shows its own file and name and opens the drawer it is edited in", () => {
  for (const tile of TILES) {
    const jsx = tileOf(tile.id)
    assert.ok(jsx.includes(`to="${tile.to}"`), `${tile.id} opens ${tile.to}`)
    assert.ok(jsx.includes(`label={t("${tile.label}")}`), `${tile.id} is named by ${tile.label}`)
    assert.ok(jsx.includes(`url={${tile.url}}`), `${tile.id} shows ${tile.url}`)
    assert.ok(jsx.includes(`shape="${tile.shape}"`), `${tile.id} is a ${tile.shape}`)
  }
  assert.match(tileOf("logo_dark"), /\n\s+dark\n/, "the dark logo sits on the dark tile")
  assert.doesNotMatch(tileOf("logo_light"), /\n\s+dark\n/, "the light logo does not")
  const tile = componentOf(file, "BrandingImageTile")
  assert.ok(tile.includes("<Link") && tile.includes("to={to}"), "the whole tile is the link")
  assert.ok(tile.includes("data-testid={`branding-tile-${id}`}"))
})

test("the grid sits in the first section above its one row; no picture is a row any more", () => {
  const logo = page.slice(page.indexOf('id: "logo"'), page.indexOf('id: "icons"'))
  assert.ok(logo.indexOf("lead: (") < logo.indexOf("rows: ["), "the grid comes before the rows")
  assert.ok(logo.includes('id: "shop_name_short"'), "the short name stays a row")
  for (const id of ["logo_light", "logo_dark", "og_image", "favicon"]) {
    assert.ok(!page.includes(`id: "${id}"`), `${id} is not a row`)
  }
  assert.ok(!page.includes("fileRow("), "the row builder for files is gone")
  assert.ok(detail.includes("lead?: ReactNode"), "SettingsSection takes the grid")
  assert.ok(
    detail.indexOf("{section.lead ?") < detail.indexOf("{section.body ??"),
    "SettingsDetail draws the grid between the header and the rows"
  )
})

test("the icon section no longer repeats the favicon: its header says whether the set was built", () => {
  const icons = page.slice(page.indexOf('id: "icons"'), page.indexOf('id: "color"'))
  const header = icons.slice(0, icons.indexOf("rows: ["))
  assert.ok(header.includes("status: favicon"), "the set's state is the section's badge")
  assert.ok(header.includes('t("brandingSettings.appIcons.built")') && header.includes('t("brandingSettings.appIcons.notBuilt")'))
  const previewRow = icons.slice(icons.indexOf('id: "icons_preview"'), icons.indexOf('id: "icon_maskable"'))
  assert.ok(previewRow.includes('t("brandingSettings.appIcons.notBuiltHint")'), "a favicon without a set says what to do")
  assert.ok(previewRow.includes('t("brandingSettings.appIcons.empty")'), "no favicon says where the set comes from")
})

test("an empty or broken picture is the grey placeholder with an image icon and «Не загружено»", () => {
  const image = componentOf(file, "BrandingImage")
  assert.ok(image.includes("onError={() => setFailed(src)}"), "a file that does not load falls back")
  assert.ok(image.includes("if (!src || failed === src) {") && image.includes("return <>{fallback}</>"), "no file falls back too")
  const placeholder = componentOf(file, "ImagePlaceholder")
  assert.ok(placeholder.includes("bg-ui-bg-component"), "grey, the shared Thumbnail's tile colour")
  assert.ok(placeholder.includes("<Photo />"), "the image icon")
  const tile = componentOf(file, "BrandingImageTile")
  assert.ok(tile.includes('fallback={<ImagePlaceholder label={t("brandingSettings.file.empty")}'), "the tile says «Не загружено»")
  assert.equal(ru.brandingSettings.file.empty, "Не загружено")
  assert.equal(en.brandingSettings.file.empty, "Not uploaded")
})

test("no bare <img> on the screen: every picture goes through BrandingImage", () => {
  for (const [name, source] of [["branding-file.tsx", file], ["app-icons.tsx", preview], ["branding.tsx", page], ["header-preview.tsx", header]]) {
    const imgs = source.match(/<img\b/g) ?? []
    const allowed = name === "branding-file.tsx" ? 1 : 0
    assert.equal(imgs.length, allowed, `${name}: ${imgs.length} <img>, only BrandingImage draws one`)
  }
  assert.ok(componentOf(file, "BrandingThumb").includes("<BrandingImage"), "the drawer and row thumbnails fall back too")
  // Found on the shots of 15.10: a 404 logo left an empty gap in the header preview.
  assert.ok(header.includes("<BrandingImage src={logoUrl}") && header.includes("fallback={name}"), "a logo that does not load reads as the short name")
})

test("the icon set's preview uses the same placeholder for the tab, iOS and Android", () => {
  assert.ok(preview.includes('import { BrandingImage, ImagePlaceholder } from "./branding-file"'))
  assert.equal((preview.match(/<BrandingImage\b/g) ?? []).length, 2, "the tab icon and the home-screen icon")
  assert.equal((preview.match(/fallback=\{<ImagePlaceholder/g) ?? []).length, 2)
  assert.ok(!preview.includes("rounded-full bg-ui-bg-component"), "the old bare grey dot is gone")
})

test("the row hints the tiles replaced are gone from both catalogs", () => {
  for (const key of ["logoLightEmpty", "logoDarkHint", "ogImageRead"]) {
    assert.equal(ru.brandingSettings.fields[key], undefined, `ru fields.${key}`)
    assert.equal(en.brandingSettings.fields[key], undefined, `en fields.${key}`)
  }
})

/**
 * t-2026-10-20-30 (Ivan 25.10 on «Логотип (светлая тема)» at 375: «здесь нужно
 * сделать вертикальную ориентацию макетов, чтобы показывать мобильные версии
 * шаблонов»; the lead's d-2026-10-25-18). Below `sm` the two logo tiles are
 * portrait phones of the storefront; the social image and the favicon keep
 * their shapes, and at `sm` and wider nothing changes.
 */
test("on a phone a logo tile is a portrait mockup of the storefront, light for the light logo and dark for the dark one", () => {
  for (const id of ["logo_light", "logo_dark"]) {
    assert.ok(tileOf(id).includes("name={shopName}"), `${id}'s phone reads the shop's name without a logo`)
  }
  for (const id of ["og_image", "favicon"]) {
    assert.ok(!tileOf(id).includes("name="), `${id} keeps its own shape`)
  }
  assert.ok(page.includes('const shopName = branding?.shop_name_short || store?.name ||'), "the same fallback as HeaderPreview's name")

  const tile = componentOf(file, "BrandingImageTile")
  assert.ok(tile.includes('const phone = shape === "logo" && name !== undefined'))
  assert.ok(tile.includes('<span className="sm:hidden">') && tile.includes("<StorefrontPhoneMockup url={url} name={name} dark={dark} />"), "the phone shows below sm only")
  assert.ok(tile.includes('phone ? "hidden sm:flex" : "flex"'), "the 16:9 tile is back from sm")
  assert.ok(tile.includes("aspect-video"), "the 16:9 tile itself is unchanged")

  const mockup = componentOf(file, "StorefrontPhoneMockup")
  assert.ok(mockup.includes("aspect-[9/19]"), "portrait, about 9:19")
  assert.ok(mockup.includes('dark ? "hub-dark" : "hub-light"'), "pinned to its theme")
  assert.ok(mockup.includes("<BrandingImage src={url}") && mockup.includes("fallback={name}"), "the logo in the header, or the name in its place")
  assert.equal((mockup.match(/<MockupBlock className="aspect-\[4\/3\] w-full" \/>/g) ?? []).length, 1, "one hero block")
  assert.ok(mockup.includes("{[0, 1].map((card) =>"), "two product cards")
  assert.doesNotMatch(mockup, /\bt\(|₽|\$|\d+\s?(?:руб|RUB)/, "plain blocks: no invented text or prices")
  assert.doesNotMatch(mockup, /\bui-(?:bg|fg|border)-/, "the preset's classes resolve on html and would follow the panel's theme")

  const css = read("theme/hub-theme.css")
  assert.ok(css.includes("\n.hub-light,\n:root {\n"), "hub-light takes the light tokens")
  assert.ok(css.includes("\n.hub-dark,\n.dark {\n"), "hub-dark takes the dark tokens")
})
