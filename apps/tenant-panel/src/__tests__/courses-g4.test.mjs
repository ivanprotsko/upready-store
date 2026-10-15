import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import i18n from "i18next"

import { OWNER_ROUTES, PARAM_RESOLVERS } from "../../e2e/owner-routes.mjs"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G4 «Курсы»): /courses and the
 * course card rebuilt after the Fable prototype. Ivan, 14.10.2026 ~23:45, on
 * the course card: «это тоже кстати лучше спрятать, чтобы без надобности не
 * торчали поля». The list is `_DataTable` with «…» in a row and «Создать
 * курс» in a modal; the card only reads, in sections, and every field opens
 * in a drawer on its own address: the course, the stream, a lesson, an entry
 * of the course page. This package cannot render JSX (see
 * `settings-detail-edit-drawer.test.mjs`), so the screens are asserted on
 * their source; the plural forms run for real against ru.json.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const DIR = "routes/courses"
const FILES = [
  `${DIR}/course-labels.ts`,
  `${DIR}/use-course-delete.tsx`,
  `${DIR}/course-list/course-list.tsx`,
  `${DIR}/course-create/course-create.tsx`,
  `${DIR}/course-detail/course-detail.tsx`,
  `${DIR}/course-detail/breadcrumb.tsx`,
  `${DIR}/course-detail/numbered-list.tsx`,
  `${DIR}/course-detail/course-lessons-section.tsx`,
  `${DIR}/course-detail/course-page-section.tsx`,
  `${DIR}/course-edit/course-edit.tsx`,
  `${DIR}/course-stream-edit/course-stream-edit.tsx`,
  `${DIR}/lesson-form/lesson-form.tsx`,
  `${DIR}/lesson-form/lesson-form-values.ts`,
  `${DIR}/lesson-new/lesson-new.tsx`,
  `${DIR}/lesson-edit/lesson-edit.tsx`,
  `${DIR}/page-entry-edit/page-entry-edit.tsx`,
]
const list = read(`${DIR}/course-list/course-list.tsx`)
const create = read(`${DIR}/course-create/course-create.tsx`)
const detail = read(`${DIR}/course-detail/course-detail.tsx`)
const lessons = read(`${DIR}/course-detail/course-lessons-section.tsx`)
const page = read(`${DIR}/course-detail/course-page-section.tsx`)
const rows = read(`${DIR}/course-detail/numbered-list.tsx`)
const remove = read(`${DIR}/use-course-delete.tsx`)
const lessonForm = read(`${DIR}/lesson-form/lesson-form.tsx`)

/** The source without its comments, for «no literal on screen» checks. */
const code = (source) =>
  source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "")

await i18n.init({
  lng: "ru",
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT("ru")

// ── the router and the walker ───────────────────────────────────────────────

test("the create modal hangs under the list; the card's drawers under the card; the crumbs read keys", () => {
  const start = app.indexOf('path: "/courses",')
  const block = app.slice(start, app.indexOf('path: "/categories"', start))
  assert.ok(block.includes('breadcrumb: () => t("courses.title")'))
  assert.ok(!block.includes("defaultValue"), "no literal fallback in the crumb (rule 7)")
  assert.ok(block.includes('{ path: "create", lazy: () => import("./routes/courses/course-create") }'))
  assert.ok(block.includes('await import("./routes/courses/course-detail")'))
  assert.ok(block.includes("breadcrumb: (match: UIMatch) => <Breadcrumb {...match} />"), "the card's crumb is the course's name")
  for (const [path, module] of [
    ["edit", "course-edit"],
    ["stream/edit", "course-stream-edit"],
    ["lessons/new", "lesson-new"],
    ["lessons/:lessonId", "lesson-edit"],
    ["page/:list/new", "page-entry-edit"],
    ["page/:list/:index", "page-entry-edit"],
  ]) {
    assert.ok(block.includes(`{ path: "${path}", lazy: () => import("./routes/courses/${module}") }`), path)
  }
})

test("each route module hands the router its screen", () => {
  for (const [folder, name] of [
    ["course-list", "CourseList"],
    ["course-create", "CourseCreate"],
    ["course-detail", "CourseDetail"],
    ["course-edit", "CourseEdit"],
    ["course-stream-edit", "CourseStreamEdit"],
    ["lesson-new", "LessonNew"],
    ["lesson-edit", "LessonEdit"],
    ["page-entry-edit", "PageEntryEdit"],
  ]) {
    assert.match(read(`${DIR}/${folder}/index.ts`), new RegExp(`${name} as Component`), folder)
  }
  assert.match(read(`${DIR}/course-detail/index.ts`), /CourseDetailBreadcrumb as Breadcrumb/)
})

test("every new address is in the owner route manifest as an overlay, with resolvers for the course page", async () => {
  const byPath = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  for (const path of [
    "/courses/create",
    "/courses/:course_id/edit",
    "/courses/:course_id/stream/edit",
    "/courses/:course_id/lessons/new",
    "/courses/:course_id/lessons/:lesson_id",
    "/courses/:course_id/page/:course_page_list/new",
    "/courses/:course_id/page/:course_page_list/:course_page_entry",
  ]) {
    assert.equal(byPath.get(path)?.kind, "overlay", path)
  }
  assert.equal(await PARAM_RESOLVERS.course_page_list(), "about")

  const api = (metadata) => async (path) =>
    path.startsWith("/tenants/courses/")
      ? { course: { id: "course_1", product_id: "prod_1" } }
      : { product: { id: "prod_1", metadata } }
  const got = { course_id: "course_1", course_page_list: "about" }
  assert.equal(await PARAM_RESOLVERS.course_page_entry(api({ course_page: { about: [{}] } }), got), "0")
  await assert.rejects(PARAM_RESOLVERS.course_page_entry(api({}), got), /no «about» entry/)
})

// ── the list ────────────────────────────────────────────────────────────────

test("the list is _DataTable: Курс · Товар · Уроки · Статус · «…», a row opens the card", () => {
  assert.ok(list.includes("<_DataTable") && !/<Table[\s>]/.test(list))
  const headers = [...list.matchAll(/header: t\("courses\.columns\.(\w+)"\)/g)].map((m) => m[1])
  assert.deepEqual(headers, ["course", "product", "lessons", "status"])
  assert.deepEqual(headers.map((key) => t(`courses.columns.${key}`)), ["Курс", "Товар", "Уроки", "Статус"])
  assert.ok(list.includes('columnHelper.accessor("lesson_count"'), "the lesson count comes with the list")
  assert.ok(list.includes("navigateTo={(row) => `/courses/${row.original.id}`}"))
})

test("the row carries no form and no button: «…» is «Изменить» and, last and red, «Удалить курс»", () => {
  assert.ok(!/<form|<Input\b|<select/.test(list), "the create form left the list")
  const menu = list.slice(list.indexOf("const CourseRowActions"), list.indexOf("const useColumns"))
  assert.ok(menu.indexOf('to: `/courses/${course.id}/edit`') < menu.indexOf('t("courses.card.delete")'))
  assert.match(menu, /destructive: true/)
  assert.match(menu, /aria-label=\{t\("fields\.actions"\)\}/)
})

test("no course yet is NoRecords with the one «Создать курс», and no header button over it (rule 10)", () => {
  assert.match(list, /<NoRecords\s+title=\{t\("courses\.empty\.title"\)\}/)
  assert.match(list, /action=\{\{ to: "\/courses\/create", label: t\("courses\.create"\) \}\}/)
  assert.match(list, /\{hasCourses \? \(\s*<Button size="small" variant="secondary" asChild>/)
  // Lead 15.10: the message says what to do next instead of the subtitle again,
  // centred with room at the sides when it wraps at 390.
  assert.notEqual(t("courses.empty.message"), t("courses.subtitle"))
  assert.match(list, /<NoRecords[^>]*className="[^"]*\bpx-6\b[^"]*\btext-center\b/)
})

test("«Создать курс» is a modal of two fields: the name and a Combobox of the products without a course", () => {
  assert.match(create, /<RouteFocusModal>\s*<CreateForm \/>\s*<\/RouteFocusModal>/)
  assert.ok(create.includes("<RouteFocusModal.Form form={form}>"))
  assert.ok(create.includes("<Combobox"))
  assert.ok(create.includes("productsWithoutCourse(products ?? [], courses ?? [])"))
  assert.equal((create.match(/<Form\.Field/g) ?? []).length, 2)
  assert.ok(create.includes("handleSuccess(`/courses/${course.id}`)"), "the new course's card opens")
})

// ── the card ────────────────────────────────────────────────────────────────

test("the card only reads: sections in order general → lessons → stream → the course page", () => {
  assert.ok(!/<(Input|Textarea|Switch|Button|form)\b/.test(detail), "no field and no button on the card")
  const order = [
    '<SettingsDetailSection section={general} level="h1" />',
    "<CourseLessonsSection",
    "<SettingsDetailSection section={stream} />",
    "<CoursePageSection",
  ].map((piece) => detail.indexOf(piece))
  assert.ok(order.every((at, i) => at > -1 && (i === 0 || at > order[i - 1])), `order ${order}`)
  assert.ok(detail.includes("hasOutlet"), "the drawers open over the card")
})

test("the first section: name and status badge in the header; «…» is Изменить, Посмотреть на витрине, then Удалить курс", () => {
  const general = detail.slice(detail.indexOf("const general"), detail.indexOf("const stream"))
  assert.match(general, /status: \{ color: STATUS_BADGE_COLOR\[course\.status\]/)
  const at = (needle) => general.indexOf(needle)
  assert.ok(at('to: "edit"') < at('t("courses.card.openStorefront")'))
  assert.ok(at('t("courses.card.openStorefront")') < at('t("courses.card.delete")'))
  assert.match(general, /destructive: true/)
  assert.deepEqual(
    [...general.matchAll(/label: t\("courses\.card\.(\w+)"\)/g)].map((m) => m[1]),
    ["openStorefront", "delete", "product", "storefront", "description"]
  )
  assert.ok(general.includes('navigate("/courses", { replace: true })'), "after a delete the list opens")
})

test("the stream section keeps today's four fields as read rows with their own drawer", () => {
  const stream = detail.slice(detail.indexOf("const stream"), detail.indexOf("return (", detail.indexOf("const stream")))
  assert.ok(stream.includes('editTo: "stream/edit"'))
  for (const key of ["channel", "chat", "start", "access"]) {
    assert.ok(stream.includes(`t("courses.stream.${key}")`), key)
  }
  assert.ok(stream.includes("getFullDate({ date: course.start_date })"), "the date reads in the panel's format (rule 14)")
  assert.equal(t("courses.stream.accessValue", { count: 1 }), "1 день")
  assert.equal(t("courses.stream.accessValue", { count: 3 }), "3 дня")
  assert.equal(t("courses.stream.accessValue", { count: 97 }), "97 дней")
})

test("lessons: «Добавить урок» in the header, a row opens its drawer, «…» is Изменить · Выше · Ниже · Удалить урок", () => {
  assert.match(lessons, /<Link to="lessons\/new" data-testid="lesson-new">/)
  assert.ok(lessons.includes("to={(lesson) => `lessons/${lesson.id}`}"))
  const at = (needle) => lessons.indexOf(needle)
  assert.ok(at('t("actions.change")') < at('t("courses.lessons.moveUp")'))
  assert.ok(at('t("courses.lessons.moveDown")') < at('t("courses.lessons.delete")'))
  assert.match(lessons, /label: t\("courses\.lessons\.delete"\),\s*destructive: true/)
  assert.ok(lessons.includes("await prompt({"), "a lesson is deleted behind a prompt")
  assert.ok(!/SortableList|DragHandle/.test(lessons), "no drag handle any more")
  assert.ok(lessons.includes("group={(lesson) => lesson.section?.trim() || null}"), "a section's name tops its lessons")
})

test("the card's lists: ten rows a page with the panel's pagination, NoRecords without a button when empty", () => {
  assert.match(rows, /export const LIST_PAGE_SIZE = 10/)
  assert.ok(rows.includes("<Table.Pagination"))
  assert.match(rows, /<NoRecords title=\{empty\.title\} message=\{empty\.message\} \/>/)
  assert.match(rows, /aria-label=\{t\("fields\.actions"\)\}/)
})

test("the course page: three read lists, «Добавить …» in each header, «…» moves or deletes an entry behind a prompt", () => {
  assert.ok(page.includes("COURSE_PAGE_LISTS.map((list) =>"))
  assert.ok(page.includes("<Link to={`page/${list}/new`}"))
  assert.ok(page.includes("`page/${list}/${index}`"))
  assert.ok(page.includes("await prompt({"))
  assert.deepEqual(
    ["about", "faq", "testimonials"].map((list) => t(`coursePage.${list}.add`)),
    ["Добавить раздел", "Добавить вопрос", "Добавить отзыв"]
  )
  assert.ok(!/SortableList|DragHandle/.test(page), "no drag handle any more")
})

// ── the drawers and the prompt ─────────────────────────────────────────────

test("«Курс» and «Поток» are SettingsEditDrawers; the start is the panel's DatePicker", () => {
  const edit = read(`${DIR}/course-edit/course-edit.tsx`)
  const stream = read(`${DIR}/course-stream-edit/course-stream-edit.tsx`)
  assert.ok(edit.includes("<SettingsEditDrawer<CourseDraft>"))
  assert.ok(stream.includes("<SettingsEditDrawer<StreamDraft>"))
  for (const field of ["title", "slug", "description", "published"]) {
    assert.ok(edit.includes(`name="${field}"`), field)
  }
  assert.ok(stream.includes('<DatePicker granularity="day"'))
  assert.ok(!stream.includes('type="date"'), "no native date input (panel-ds «Запрещено»)")
})

test("the lesson is a side drawer: the prototype's fields first, every other field kept under «Дополнительно»", () => {
  assert.ok(lessonForm.includes("<RouteDrawer.Header>") && !lessonForm.includes("RouteFocusModal"))
  const at = (needle) => lessonForm.indexOf(needle)
  assert.ok(at('t("courses.lesson.title")') < at('t("courses.lesson.videos")'))
  assert.ok(at('t("courses.lesson.videos")') < at('t("courses.lesson.body")'))
  assert.ok(at('t("courses.lesson.body")') < at('t("courses.lesson.more")'))
  for (const key of ["section", "day", "summary", "cover", "files", "links"]) {
    assert.ok(at(`t("courses.lesson.${key}")`) > at('t("courses.lesson.more")'), key)
  }
  assert.ok(lessonForm.includes("toast.success(successMessage)"), "the outcome is a toast (rule 11)")
  assert.match(read(`${DIR}/lesson-new/lesson-new.tsx`), /<RouteDrawer>\s*<LessonForm/)
  assert.match(read(`${DIR}/lesson-edit/lesson-edit.tsx`), /t\("courses\.lesson\.editTitle", \{ number: index \+ 1 \}\)/)
})

test("deleting a course asks for its title typed in and names how many lessons go with it", () => {
  assert.ok(remove.includes("verificationText: course.title"))
  assert.ok(remove.includes('verificationInstruction: t("general.typeToConfirm")'))
  assert.equal(t("courses.deletePrompt.title", { title: "Очищение печени" }), "Удалить курс «Очищение печени»?")
  assert.match(t("courses.deletePrompt.description", { count: 23 }), /^Вместе с курсом удалятся 23 урока\./)
  assert.match(t("courses.deletePrompt.description", { count: 1 }), /^Вместе с курсом удалится 1 урок\./)
  assert.match(t("courses.deletePrompt.description", { count: 5 }), /^Вместе с курсом удалятся 5 уроков\./)
})

// ── words ───────────────────────────────────────────────────────────────────

test("every i18n key the course screens read exists in ru.json and en.json", () => {
  const keys = new Set(
    FILES.flatMap((path) => [...read(path).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  assert.ok(keys.size > 60, `expected the screens' keys, found ${keys.size}`)
  const dynamic = [
    ...Object.keys(ru.courses.status).map((key) => `courses.status.${key}`),
    ...Object.keys(ru.courses.lesson.errors).map((key) => `courses.lesson.errors.${key}`),
    ...Object.keys(ru.courses.lesson.linkKinds).map((key) => `courses.lesson.linkKinds.${key}`),
    ...["about", "faq", "testimonials"].flatMap((list) =>
      ["title", "hint", "add", "empty", "emptyMessage", "newTitle", "editTitle", "delete", "deleteTitle"].map(
        (key) => `coursePage.${list}.${key}`
      )
    ),
  ]
  for (const key of [...keys, ...dynamic]) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("no Russian literal and no English fallback on screen (rule 7)", () => {
  for (const path of FILES) {
    const source = code(read(path))
    assert.ok(!/[А-Яа-яЁё]/.test(source), `${path}: a Russian literal outside a key`)
    assert.ok(!/\bdefaultValue\s*:/.test(source), `${path}: a defaultValue fallback`)
  }
})
