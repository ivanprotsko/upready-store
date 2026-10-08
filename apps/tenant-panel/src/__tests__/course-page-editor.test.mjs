import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  coursePageChanged,
  coursePageIssues,
  coursePageMetadata,
  coursePageTranslations,
  emptyRow,
  readCoursePageDraft,
} from "../routes/courses/course-page.ts"
import { permissionOfPath, permissionsOf, pathAllowed } from "../lib/permissions.ts"

/**
 * t-2026-10-08-38, the «Страница курса» section of the course screen: the
 * lists under the course card on the storefront, kept in
 * `metadata.course_page` of the course's product.
 *
 * `course-page.ts` is plain TS, so it is imported and run for real. So is the
 * storefront's own reader, `readCoursePage`: what the panel writes is read
 * back by the very function the product page renders from, rather than by a
 * copy of it here. That file imports `./locale-copy` without an extension, the
 * way Next resolves it, so a resolve hook adds `.ts` for the storefront's
 * sources. The React section is checked the way the rest of this folder does
 * it, by reading the source.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const STOREFRONT_UTIL = join(SRC, "../../storefront/src/lib/util")
const BACKEND_API = join(SRC, "../../backend/src/api")
const read = (path) => readFileSync(join(SRC, path), "utf8")

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/storefront/src/") && /^\.\.?\/[^.]+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { readCoursePage } = await import(join(STOREFRONT_UTIL, "course-page.ts"))

/** A product as a seeded course carries it: a cover, a translation, keys of other features. */
const product = () => ({
  digital: "true",
  seo_title: "Очищение печени",
  cover: { src: "https://cdn.example.test/cover.jpg", srcset: [], width: 1600, height: 900, alt: "" },
  course_page: {
    about: [
      { heading: "Кому подойдёт", body: "Тем, кто устал от тяжести." },
      { heading: "Что внутри", body: "7 уроков и практики." },
    ],
    faq: [{ q: "Когда старт?", a: "30 марта." }],
    testimonials: [
      { author: "Анна", text: "Стало легче.", source: "text" },
      { author: "Мария", text: "Со скриншота.", source: "image", image_url: "/static/review-2.png" },
    ],
    i18n: {
      en: {
        about: [{ heading: "Who it is for", body: "Anyone tired of heaviness." }],
        faq: [],
        testimonials: [],
      },
    },
  },
})

test("the editor loads the product's page: every list, in its order, with its fields", () => {
  const draft = readCoursePageDraft(product())

  assert.deepEqual(
    draft.about.map(({ heading, body }) => [heading, body]),
    [
      ["Кому подойдёт", "Тем, кто устал от тяжести."],
      ["Что внутри", "7 уроков и практики."],
    ]
  )
  assert.deepEqual(draft.faq.map(({ q, a }) => [q, a]), [["Когда старт?", "30 марта."]])
  assert.deepEqual(
    draft.testimonials.map(({ author, text, source }) => [author, text, source]),
    [
      ["Анна", "Стало легче.", "text"],
      ["Мария", "Со скриншота.", "image"],
    ]
  )
  assert.equal(new Set([...draft.about, ...draft.faq, ...draft.testimonials].map((row) => row.id)).size, 5)
  assert.equal(coursePageChanged(product(), draft), false, "a page just loaded has nothing to save")
})

test("a product with no page yet opens with three empty lists", () => {
  for (const metadata of [null, undefined, {}, { course_page: "broken" }, { course_page: { about: "x" } }]) {
    const draft = readCoursePageDraft(metadata)
    assert.deepEqual([draft.about, draft.faq, draft.testimonials], [[], [], []])
  }
})

test("an edit, an addition, a deletion and a move are read back by the storefront as the owner left them", () => {
  const metadata = product()
  const draft = readCoursePageDraft(metadata)

  draft.about[0].heading = "  Кому подойдёт курс  "
  draft.about = [draft.about[1], draft.about[0]]
  draft.faq = [...draft.faq, { ...emptyRow("faq"), q: "Есть запись?", a: "Да, **навсегда**." }]
  draft.testimonials = draft.testimonials.filter((row) => row.author !== "Анна")

  assert.equal(coursePageChanged(metadata, draft), true)
  assert.deepEqual(coursePageIssues(draft), [])

  const saved = coursePageMetadata(metadata, draft)

  assert.deepEqual(readCoursePage(saved, "ru"), {
    about: [
      { heading: "Что внутри", body: "7 уроков и практики." },
      { heading: "Кому подойдёт курс", body: "Тем, кто устал от тяжести." },
    ],
    faq: [
      { q: "Когда старт?", a: "30 марта." },
      { q: "Есть запись?", a: "Да, **навсегда**." },
    ],
    testimonials: [{ author: "Мария", text: "Со скриншота.", source: "image" }],
  })
  assert.equal(coursePageChanged(saved, readCoursePageDraft(saved)), false)
})

test("the save keeps every other key of metadata, the cover and the translation, and adds no key of its own", () => {
  const metadata = product()
  const draft = readCoursePageDraft(metadata)
  draft.faq[0].a = "1 апреля."

  const saved = coursePageMetadata(metadata, draft)
  const before = product()

  assert.deepEqual(Object.keys(saved).sort(), Object.keys(before).sort())
  assert.equal(saved.digital, before.digital)
  assert.equal(saved.seo_title, before.seo_title)
  assert.deepEqual(saved.cover, before.cover)
  assert.deepEqual(Object.keys(saved.course_page).sort(), ["about", "faq", "i18n", "testimonials"])
  assert.deepEqual(saved.course_page.i18n, before.course_page.i18n)
  assert.deepEqual(saved.course_page.testimonials[1], before.course_page.testimonials[1],
    "a key of an entry the form does not show (image_url) is written back as it was")
  assert.equal(JSON.stringify(saved).includes('"id"'), false, "the form's row ids never reach the product")
  assert.deepEqual(metadata, before, "the product's own object is not changed in place")

  // The translation still wins on its own language, where it has a list.
  assert.deepEqual(readCoursePage(saved, "en").about, before.course_page.i18n.en.about)
  assert.deepEqual(readCoursePage(saved, "en").faq, [{ q: "Когда старт?", a: "1 апреля." }])
})

test("empty lists are allowed: nothing to fill in, and the storefront shows no such section", () => {
  const metadata = product()
  const draft = readCoursePageDraft(metadata)
  draft.about = []
  draft.faq = []
  draft.testimonials = []

  assert.deepEqual(coursePageIssues(draft), [])
  const saved = coursePageMetadata(metadata, draft)
  assert.deepEqual(
    [saved.course_page.about, saved.course_page.faq, saved.course_page.testimonials],
    [[], [], []]
  )
  assert.deepEqual(saved.cover, metadata.cover)
  assert.equal(readCoursePage(saved, "ru"), null)

  const fresh = coursePageMetadata({ digital: "true" }, readCoursePageDraft({ digital: "true" }))
  assert.deepEqual(fresh, { digital: "true", course_page: { about: [], faq: [], testimonials: [] } })
})

test("the check flags exactly the entries the storefront would drop", () => {
  const draft = readCoursePageDraft(null)
  draft.about = [
    { ...emptyRow("about"), heading: "Есть", body: "   " },
    { ...emptyRow("about"), heading: "Полный", body: "Текст" },
  ]
  draft.faq = [{ ...emptyRow("faq"), q: "", a: "Ответ без вопроса" }]
  draft.testimonials = [emptyRow("testimonials")]

  assert.deepEqual(coursePageIssues(draft), [
    { list: "about", index: 0, field: "body" },
    { list: "faq", index: 0, field: "q" },
    { list: "testimonials", index: 0, field: "author" },
    { list: "testimonials", index: 0, field: "text" },
  ])

  // Each flagged entry is one the storefront's reader drops; the others survive.
  const page = readCoursePage(coursePageMetadata(null, draft), "ru")
  assert.deepEqual(page, {
    about: [{ heading: "Полный", body: "Текст" }],
    faq: [],
    testimonials: [],
  })
})

test("an entry the storefront hides for an empty field is shown to the owner, not lost", () => {
  const draft = readCoursePageDraft({
    course_page: { about: [{ heading: "Без текста" }, "not an entry"], faq: [{ q: 7, a: "Ответ" }] },
  })

  assert.deepEqual(draft.about.map(({ heading, body }) => [heading, body]), [["Без текста", ""]])
  assert.deepEqual(draft.faq.map(({ q, a }) => [q, a]), [["", "Ответ"]])
  assert.deepEqual(coursePageIssues(draft), [
    { list: "about", index: 0, field: "body" },
    { list: "faq", index: 0, field: "q" },
  ])
})

test("the languages of the page's translation are named, and none for a page without one", () => {
  assert.deepEqual(coursePageTranslations(product()), ["en"])
  assert.deepEqual(coursePageTranslations({ course_page: { about: [] } }), [])
  assert.deepEqual(coursePageTranslations(null), [])
})

test("rights: the course screen and the product write both need catalog, which an operator has not", () => {
  const operator = permissionsOf({ role: "operator", permissions: ["orders", "customers"] })
  const manager = permissionsOf({
    role: "manager",
    permissions: ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces"],
  })

  assert.equal(permissionOfPath("/courses/course_1"), "catalog")
  assert.equal(pathAllowed(operator, "/courses/course_1"), false)
  assert.equal(pathAllowed(manager, "/courses/course_1"), true)

  // The server's own table, read as text: its module imports the Medusa model DSL.
  const server = readFileSync(join(BACKEND_API, "tenants/permissions.ts"), "utf8")
  assert.match(server, /"\/tenants\/products\/\[id\]": \{ GET: "any", POST: "catalog", DELETE: "catalog" \}/)
  assert.match(server, /"\/tenants\/courses\/\[id\]": \{ GET: "catalog",/)
  assert.match(server, /operator: \["orders", "customers"\],/)
})

test("the section saves the whole metadata through the product write, and a login without catalog only reads it", () => {
  const section = read("routes/courses/course-detail/course-page-section.tsx")
  const detail = read("routes/courses/course-detail/course-detail.tsx")
  const hook = read("hooks/api/products.tsx")

  assert.match(detail, /<CoursePageSection product=\{product\} productMissing=\{isProductError\} \/>/)
  assert.match(section, /useUpdateProduct\(product\?\.id \?\? ""\)/)
  assert.match(hook, /`\/tenants\/products\/\$\{id\}`,\s*\{\s*method: "POST"/)
  assert.match(section, /\{ metadata: coursePageMetadata\(product\.metadata, draft\) \}/)

  const guard = section.indexOf("if (coursePageIssues(draft).length > 0)")
  const write = section.indexOf("await save(")
  assert.ok(guard !== -1 && write !== -1 && guard < write, "the check runs before the request is sent")
  assert.match(section.slice(guard, write), /\breturn\b/, "an incomplete entry stops the save")

  assert.match(section, /const readOnly = !can\("catalog"\)/)
  assert.match(section, /\{readOnly \? null : \(\s*<div className="flex shrink-0 items-center gap-x-3">/,
    "without catalog there is no save button")
  assert.equal((section.match(/disabled=\{readOnly\}/g) ?? []).length, 6, "every field is locked without catalog")
})

test("every string of the section is in both panel languages, translated", () => {
  const section = read("routes/courses/course-detail/course-page-section.tsx")
  const en = JSON.parse(read("i18n/translations/en.json")).coursePage
  const ru = JSON.parse(read("i18n/translations/ru.json")).coursePage

  const keys = new Set()
  for (const [, key] of section.matchAll(/t\("coursePage\.([\w.]+)"/g)) {
    keys.add(key)
  }
  for (const [, field] of section.matchAll(/t\(`coursePage\.\$\{list\}\.(\w+)`\)/g)) {
    for (const list of ["about", "faq", "testimonials"]) keys.add(`${list}.${field}`)
  }
  assert.ok(keys.size >= 25, `found ${keys.size} keys`)

  const at = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)
  for (const key of keys) {
    assert.equal(typeof at(en, key), "string", `en: coursePage.${key}`)
    assert.equal(typeof at(ru, key), "string", `ru: coursePage.${key}`)
    assert.notEqual(at(en, key), at(ru, key), `coursePage.${key} is the same in both languages`)
  }
  assert.equal(ru.header, "Страница курса")
  assert.deepEqual([ru.about.title, ru.faq.title, ru.testimonials.title], ["О курсе", "Вопросы и ответы", "Отзывы"])
})
