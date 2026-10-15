import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  footerPages,
  footerPlace,
  moveInFooter,
  orderedPages,
  pageSlugProblem,
  statusOf,
} from "../routes/pages/page-sections.ts"
import { articleListPage, filterValues, groupArticles } from "../routes/journal/article-list/article-groups.ts"
import { ARTICLE_TABS, TAB_OF_FIELD, articleSchema } from "../routes/journal/components/article-form.ts"
import { localeLabel, shownStatus } from "../routes/journal/article-locales.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G4): «Страницы» and «Журнал»
 * rebuilt after the prototype. Ivan 14.10 about the page list: «спрятать тоже,
 * пусть появляется когда юзер нажимает "добавить страницу" как например в
 * товара контрол "добавить товар"». The lists are `_DataTable`s that only read,
 * a page is created in a modal behind «Добавить страницу», and the editors are
 * tabs in their focus modal. This package cannot render JSX (no vitest/jsdom,
 * see `settings-detail-edit-drawer.test.mjs`), so the logic runs as is and the
 * screens are asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const list = read("routes/pages/page-list/page-list.tsx")
const rowActions = read("routes/pages/page-list/page-row-actions.tsx")
const reorder = read("routes/pages/page-list/reorder-footer-page.ts")
const create = read("routes/pages/page-create/page-create.tsx")
const pageForm = read("routes/pages/page-edit/components/edit-page-form/edit-page-form.tsx")
const articles = read("routes/journal/article-list/article-list.tsx")
const articleActions = read("routes/journal/article-list/article-row-actions.tsx")
const editor = read("routes/journal/components/article-editor.tsx")
const editorTabs = read("routes/journal/components/editor-tabs.tsx")

const filesOf = (dir) =>
  readdirSync(join(SRC, dir), { recursive: true })
    .filter((file) => /\.(tsx?|mjs)$/.test(file))
    .map((file) => `${dir}/${file.replaceAll("\\", "/")}`)

const page = (over) => ({
  id: "p",
  key: "x",
  locale: "ru",
  title: "",
  body: "",
  published: false,
  in_footer: false,
  footer_order: null,
  seo_title: null,
  seo_description: null,
  reserved: false,
  ...over,
})

const article = (over) => ({
  id: "a",
  slug: "a",
  locale: "ru",
  title: "A",
  body: "",
  excerpt: null,
  cover_url: null,
  category: null,
  author: null,
  tags: [],
  status: "draft",
  published: false,
  published_at: null,
  seo_title: null,
  seo_description: null,
  ...over,
})

// ── «Страницы»: the list, the footer, the address ────────────────────────────

test("a page is empty, a draft or published; the five ready sections come first", () => {
  assert.equal(statusOf(page({ id: null })), "empty")
  assert.equal(statusOf(page({ title: " ", body: "" })), "empty")
  assert.equal(statusOf(page({ title: "Доставка" })), "draft")
  assert.equal(statusOf(page({ published: true })), "published")
  const rows = orderedPages([page({ key: "delivery" }), page({ key: "offer" }), page({ key: "contacts" })])
  assert.deepEqual(rows.map((row) => row.key), ["contacts", "offer", "delivery"])
})

test("«В подвале» is the place the storefront draws: published and marked, by order, then title", () => {
  const pages = [
    page({ key: "offer", title: "Оферта", published: true, in_footer: true, footer_order: 2 }),
    page({ key: "contacts", title: "Контакты", published: true, in_footer: true, footer_order: 1 }),
    page({ key: "delivery", title: "Доставка", published: false, in_footer: true, footer_order: 0 }),
    page({ key: "about", title: "О магазине", published: true, in_footer: false }),
    page({ key: "faq", title: "Вопросы", published: true, in_footer: true, footer_order: null }),
  ]
  assert.deepEqual(footerPages(pages).map((row) => row.key), ["contacts", "offer", "faq"])
  assert.equal(footerPlace(pages, "contacts"), 1)
  assert.equal(footerPlace(pages, "faq"), 3)
  assert.equal(footerPlace(pages, "delivery"), null, "a draft is not in the footer yet")
  assert.equal(footerPlace(pages, "about"), null)
})

test("a move renumbers the footer 1, 2, 3 and writes only what changed, also when no page had an order", () => {
  const pages = [
    page({ key: "a", title: "А", published: true, in_footer: true, footer_order: 1 }),
    page({ key: "b", title: "Б", published: true, in_footer: true, footer_order: 2 }),
    page({ key: "c", title: "В", published: true, in_footer: true, footer_order: 3 }),
  ]
  assert.deepEqual(
    moveInFooter(pages, "c", "up").map(({ page: row, footer_order }) => [row.key, footer_order]),
    [["c", 2], ["b", 3]]
  )
  assert.deepEqual(moveInFooter(pages, "a", "up"), [], "the first cannot go up")
  assert.deepEqual(moveInFooter(pages, "c", "down"), [], "the last cannot go down")

  const unordered = pages.map((row) => ({ ...row, footer_order: null }))
  assert.deepEqual(
    moveInFooter(unordered, "b", "up").map(({ page: row, footer_order }) => [row.key, footer_order]),
    [["b", 1], ["a", 2], ["c", 3]],
    "a plain swap of two nulls moved nothing"
  )
})

test("a move writes the row of its own language (a Russian shop's footer is the ru rows)", () => {
  assert.ok(reorder.includes("locale: page.locale"))
  assert.ok(reorder.includes("moveInFooter(pages, key, direction)"))
})

test("a new page's address: latin, 2–48 long, not a ready section, not `create`, not taken", () => {
  assert.equal(pageSlugProblem("delivery", []), null)
  assert.equal(pageSlugProblem("d", []), "slug")
  assert.equal(pageSlugProblem("x".repeat(49), []), "slug")
  assert.equal(pageSlugProblem("Delivery", []), "slug")
  assert.equal(pageSlugProblem("dost--avka", []), "slug")
  assert.equal(pageSlugProblem("create", []), "slugReserved", "/pages/create is the modal's own address")
  assert.equal(pageSlugProblem("offer", []), "slugReserved")
  assert.equal(pageSlugProblem("delivery", ["delivery"]), "slugReserved")
})

test("the page list only reads: a _DataTable, no field, «Добавить страницу» opens /pages/create (Ivan 14.10)", () => {
  assert.ok(list.includes("<_DataTable"))
  assert.ok(list.includes('<Link to="/pages/create">') && list.includes('t("contentPages.add")'))
  assert.ok(list.includes("navigateTo={(row) => `/pages/${row.original.key}`}"), "a row opens the editor")
  for (const forbidden of ["<form", "<Input", "<Table>", "useCreateTenantPage", "IconButton", "<Trash"]) {
    assert.ok(!list.includes(forbidden), `the list must not carry ${forbidden}`)
  }
  assert.equal(ru.contentPages.add, "Добавить страницу")
  assert.ok(list.includes('footerPlace(pages, row.original.key) ?? "—"'), "the footer column is a place number")
})

test("a row's «…»: editor, storefront, up and down in the footer, delete only for the owner's own page", () => {
  for (const key of ["open", "view", "up", "down", "delete"]) {
    assert.ok(rowActions.includes(`t("contentPages.actions.${key}")`), key)
  }
  assert.ok(rowActions.includes("if (!isSectionKey(page.key))"), "the five ready sections cannot be deleted")
  assert.ok(rowActions.includes("destructive: true") && rowActions.includes('variant: "danger"'))
  assert.ok(rowActions.includes("href && page.published"), "a draft has no storefront link")
  assert.ok(rowActions.includes("place !== null"), "up and down only for a link of the footer")
})

test("the create modal: two fields, the address made from the title, «Создать и открыть» opens the editor", () => {
  assert.ok(create.includes("<RouteFocusModal>"))
  assert.ok(create.includes('name="title"') && create.includes('name="slug"'))
  assert.equal((create.match(/<Form\.Field/g) ?? []).length, 2)
  assert.ok(create.includes("if (!slugTouched)") && create.includes("toSlug(event.target.value)"))
  assert.ok(create.includes("pageSlugProblem(values.slug, taken)"))
  assert.ok(create.includes("handleSuccess(`/pages/${page.key}`)"))
  assert.ok(create.includes('t("contentPages.create.submit")'))
  assert.equal(ru.contentPages.create.submit, "Создать и открыть")
})

test("/pages/create is a route of its own before :key and an overlay of the owner manifest", () => {
  const block = app.slice(app.indexOf('path: "/pages"'), app.indexOf('path: "/journal"'))
  assert.ok(block.includes('path: "create"') && block.includes('import("./routes/pages/page-create")'))
  assert.ok(block.indexOf('path: "create"') < block.indexOf('path: ":key"'), "static before dynamic")
  assert.ok(ownerRoutes.includes('{ path: "/pages/create", kind: "overlay" }'))
})

test("the page editor: tabs «Текст» and «Публикация», one Save, a failed field opens its tab", () => {
  assert.ok(pageForm.includes('const TABS = ["text", "publish"] as const'))
  assert.ok(pageForm.includes("<EditorTabs") && pageForm.includes("<EditorSplit"))
  assert.equal((pageForm.match(/type="submit"/g) ?? []).length, 1)
  assert.ok(pageForm.includes("setTab(TAB_OF_FIELD[first])"))
  assert.equal((pageForm.match(/<SwitchBox/g) ?? []).length, 2, "published and in footer")
  for (const tab of ["text", "publish"]) {
    assert.equal(typeof ru.contentPages.editor.tabs[tab], "string")
  }
})

// ── «Журнал» ─────────────────────────────────────────────────────────────────

test("articles group by address, Russian text first, newest first", () => {
  const groups = groupArticles([
    article({ slug: "old", locale: "en", published_at: "2026-01-01T00:00:00Z" }),
    article({ slug: "new", locale: "en", title: "EN", published_at: "2026-10-01T00:00:00Z" }),
    article({ slug: "new", locale: "ru", title: "RU", published_at: "2026-10-01T00:00:00Z" }),
  ])
  assert.deepEqual(groups.map((group) => group.slug), ["new", "old"])
  assert.equal(groups[0].primary.title, "RU")
  assert.equal(groups[0].locales.length, 2)
})

test("the search, the filters and the page come from the URL; a due scheduled article is published", () => {
  const groups = groupArticles([
    article({ slug: "a", title: "Пептиды", status: "published", published: true, category: "Здоровье" }),
    article({ slug: "b", title: "Меню", status: "draft", category: "Питание" }),
    article({ slug: "c", title: "Гимнастика", status: "scheduled", published: false, category: "Практики" }),
    article({ slug: "d", title: "Массаж", status: "scheduled", published: true, category: "Практики" }),
  ])
  const slugs = (query) => articleListPage(groups, { limit: 20, ...query }).rows.map((group) => group.slug).sort()

  assert.deepEqual(slugs({}), ["a", "b", "c", "d"])
  assert.deepEqual(slugs({ q: "пепт" }), ["a"])
  assert.deepEqual(slugs({ status: "published" }), ["a", "d"], "a due scheduled article reads as published")
  assert.deepEqual(slugs({ status: "draft,scheduled" }), ["b", "c"], "several statuses are «any of them»")
  assert.deepEqual(slugs({ category: "Практики" }), ["c", "d"])
  assert.deepEqual(slugs({ q: "zzz" }), [])
  assert.equal(articleListPage(groups, { limit: 2, offset: 2 }).rows.length, 2)
  assert.equal(articleListPage(groups, { limit: 2, offset: 2 }).count, 4)
  assert.deepEqual(filterValues(undefined), [])
  assert.equal(shownStatus({ status: "scheduled", published: false }), "scheduled")
})

test("the journal list: _DataTable with «Статус» and «Рубрика» filters; NoRecords, NoResults; dates by getFullDate", () => {
  assert.ok(articles.includes("<_DataTable") && articles.includes("<DataTableQuery<ArticleGroup> search filters={filters} />"))
  assert.ok(articles.includes('key: "status"') && articles.includes('key: "category"'))
  assert.ok(articles.includes('t("journal.empty.title")') && articles.includes("<NoRecords"))
  assert.ok(articles.includes('t("journal.noResults.title")') && articles.includes("<NoResults"))
  assert.ok(articles.includes("getFullDate({ date })"), "rule 14: one date format")
  for (const forbidden of ["<Table>", "<Select", "<Input", "Intl.DateTimeFormat", "из {"]) {
    assert.ok(!articles.includes(forbidden), `the journal list must not carry ${forbidden}`)
  }
  assert.ok(articleActions.includes("destructive: true") && articleActions.includes('variant: "danger"'))
})

test("the article editor: three tabs, one Save; every field of the form belongs to a tab", () => {
  assert.deepEqual([...ARTICLE_TABS], ["text", "card", "search"])
  const fields = Object.keys(articleSchema((key) => key).shape)
  assert.equal(fields.length, 12)
  for (const field of fields) {
    assert.ok(ARTICLE_TABS.includes(TAB_OF_FIELD[field]), `${field} has a tab`)
  }
  assert.equal((editor.match(/type="submit"/g) ?? []).length, 1)
  assert.ok(editor.includes("<ArticleCardTab form={form} />") && editor.includes("<ArticleSearchTab"))
  assert.ok(editorTabs.includes("<ProgressTabs.Trigger"), "the tabs are the native ones of «Добавить товар»")
})

test("the article form's messages are catalogue keys", () => {
  const result = articleSchema((key) => key).safeParse({
    title: "",
    slug: "new",
    excerpt: "",
    cover_url: "",
    body: "",
    category: "",
    author: "",
    tags: "",
    status: "scheduled",
    published_at: "",
    seo_title: "",
    seo_description: "",
  })
  assert.equal(result.success, false)
  const messages = result.error.issues.map((issue) => issue.message).sort()
  assert.deepEqual(messages, [
    "journal.validation.publishedTitle",
    "journal.validation.scheduledDate",
    "journal.validation.slugReserved",
  ])
})

test("a language is named in itself", () => {
  assert.equal(localeLabel("ru"), "Русский")
  assert.equal(localeLabel("en"), "English")
})

// ── words ────────────────────────────────────────────────────────────────────

test("no Russian literal and no defaultValue is left in the pages and journal screens", () => {
  for (const file of [...filesOf("routes/pages"), ...filesOf("routes/journal")]) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
    assert.ok(!code.includes("defaultValue:"), `${file}: a defaultValue fallback is a literal on screen`)
    const literal = code.match(/[А-Яа-яЁё][^"`\n]*/)
    assert.equal(literal, null, `${file}: a Russian literal outside the catalog: ${literal?.[0]}`)
  }
})

test("ru and en carry the same keys for contentPages, journal and markdownEditor, none empty", () => {
  const flat = (node, prefix = "") =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "object" ? flat(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
    )
  for (const root of ["contentPages", "journal", "markdownEditor"]) {
    const ruKeys = flat(ru[root]).map(([key]) => key).sort()
    const enKeys = flat(en[root]).map(([key]) => key).sort()
    assert.deepEqual(ruKeys, enKeys, root)
    for (const [key, value] of [...flat(ru[root]), ...flat(en[root])]) {
      assert.ok(typeof value === "string" && value.trim(), `${root}.${key} is empty`)
    }
  }
})
