import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildCourseStorefrontUrl,
  productsWithoutCourse,
  productTitleById,
} from "../routes/courses/course-labels.ts"
import {
  courseScheduleBody,
  dateInputValue,
  emptyVideo,
  fromLesson,
  lessonGroups,
  moveRow,
  sectionNames,
  sectionOrderFor,
  toLessonBody,
} from "../routes/courses/lesson-form/lesson-form-values.ts"

/**
 * o24-courses, the panel's course editor (`/courses`, `/courses/:id`,
 * `lessons/new`, `lessons/:lessonId`). `course-labels.ts` is plain TS with no
 * vite macros, so it is imported and run for real, the way
 * `pricing-edit-price-save.test.mjs` runs `castNumber`. The screens themselves
 * are JSX this package cannot render (no vitest/jsdom, see
 * `error-boundary-auth.test.mjs`); their tests assert on the source directly,
 * the same way `pricing-edit-price-save.test.mjs` checks its two orderings.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

test("productsWithoutCourse drops a product that already has one", () => {
  const products = [
    { id: "prod_1", title: "Печень" },
    { id: "prod_2", title: "Почки" },
    { id: "prod_3", title: "Сердце" },
  ]
  const courses = [{ product_id: "prod_2" }]

  assert.deepEqual(productsWithoutCourse(products, courses), [
    { id: "prod_1", title: "Печень" },
    { id: "prod_3", title: "Сердце" },
  ])
})

test("productsWithoutCourse returns every product when no course exists yet", () => {
  const products = [{ id: "prod_1", title: "Печень" }]
  assert.deepEqual(productsWithoutCourse(products, []), products)
})

test("productTitleById maps a course's product_id to the product's own title", () => {
  const products = [
    { id: "prod_1", title: "Печень" },
    { id: "prod_2", title: "Почки" },
  ]
  const byId = productTitleById(products)

  assert.equal(byId.get("prod_1"), "Печень")
  assert.equal(byId.get("prod_2"), "Почки")
  assert.equal(byId.get("prod_missing"), undefined)
})

test("a failed lesson reorder puts the list back the way it was", () => {
  const source = readFileSync(
    join(SRC, "routes/courses/course-detail/course-detail.tsx"),
    "utf8"
  )

  const startIndex = source.indexOf("const handleReorder = async")
  const endIndex = source.indexOf("const handleDeleteLesson")
  assert.notEqual(startIndex, -1, "handleReorder is missing")
  assert.notEqual(endIndex, -1, "handleDeleteLesson is missing")

  const block = source.slice(startIndex, endIndex)
  assert.ok(
    block.includes("setOrderedLessons(items)"),
    "the drag must move the row optimistically, before the request resolves"
  )
  assert.ok(
    /onError:\s*\(reorderError\)\s*=>\s*{[^}]*setOrderedLessons\(previous\)/s.test(block),
    "a failed reorder must restore the previous order, not leave the optimistic one on screen"
  )
})

// t-2026-10-13-29 stage 2 moved the form's checks into `toLessonBody`
// (`lesson-form-values.ts`); they are run for real below, and the form must
// still stop on them before it sends anything.
test("the lesson form checks its values before it ever calls onSubmit, and stops on a refusal", () => {
  const source = readFileSync(join(SRC, "routes/courses/lesson-form/lesson-form.tsx"), "utf8")

  const guardIndex = source.indexOf("toLessonBody(values")
  const submitIndex = source.indexOf("await onSubmit(")
  assert.notEqual(guardIndex, -1, "the toLessonBody check is missing")
  assert.notEqual(submitIndex, -1, "the onSubmit call is missing")
  assert.ok(guardIndex < submitIndex, "the check must run before the request is sent")

  const guardBlock = source.slice(guardIndex, submitIndex)
  assert.ok(/if \(!result\.ok\)[\s\S]*\breturn\b/.test(guardBlock), "a refused value must stop the submit, not just warn")
})

test("the lesson form refuses an empty title and a video link with no http(s) scheme", () => {
  const values = { ...fromLesson(), title: "Урок" }

  assert.equal(toLessonBody({ ...values, title: "  " }).ok, false)
  assert.equal(toLessonBody({ ...values, videos: [{ ...emptyVideo(), url: "ftp://cdn.test/v.mp4" }] }).ok, false)
  assert.equal(toLessonBody({ ...values, videos: [{ ...emptyVideo(), url: "cdn.test/v.mp4" }] }).ok, false)
  assert.equal(toLessonBody({ ...values, videos: [{ ...emptyVideo(), url: "https://cdn.test/v.mp4" }] }).ok, true)
})

test("buildCourseStorefrontUrl reads the real product-page address of the course, on the shop's own host", () => {
  assert.equal(
    buildCourseStorefrontUrl("shop.upready.store", "ru", "superkurs"),
    "https://shop.upready.store/ru/products/superkurs"
  )
})

test("buildCourseStorefrontUrl defaults to ru when the shop has no default locale saved yet", () => {
  assert.equal(
    buildCourseStorefrontUrl("shop.upready.store", undefined, "superkurs"),
    "https://shop.upready.store/ru/products/superkurs"
  )
})

test("buildCourseStorefrontUrl never invents a host: no primaryHost, no URL", () => {
  assert.equal(buildCourseStorefrontUrl(undefined, "ru", "superkurs"), null)
})

test("buildCourseStorefrontUrl answers null while the product handle has not loaded yet", () => {
  assert.equal(buildCourseStorefrontUrl("shop.upready.store", "ru", undefined), null)
})

test("deleting a course warns that a buyer's own access survives it", () => {
  const source = readFileSync(
    join(SRC, "routes/courses/course-detail/course-detail.tsx"),
    "utf8"
  )
  assert.ok(
    source.includes("Покупатели, уже получившие доступ,"),
    "the delete prompt must say access already granted is not revoked (course-helpers.ts DELETE route keeps entitlement rows on purpose)"
  )
})

// t-2026-10-13-29 stage 2: the lesson form's values become the contract's
// fields (`lesson-form-values.ts`, plain TS, imported and run for real).

const courseLessons = [
  { id: "l1", section: "Подготовка", order: 0 },
  { id: "l2", section: "Подготовка", order: 1 },
  { id: "l3", section: "Первая неделя программы", order: 2 },
]

const filled = () => ({
  ...fromLesson(),
  title: "  Дыхательная гимнастика ",
  body: "Текст",
  section: " Первая неделя программы ",
  summary: " Как дышать по Стрельниковой ",
  cover_url: "https://cdn.test/cover.jpg",
  available_from_day: "3",
  videos: [
    { url: "https://cdn.test/v1.mp4", title: "", duration_sec: 225, poster_url: "https://cdn.test/p.jpg" },
    emptyVideo(),
    { url: " https://cdn.test/v2.mp4 ", title: " Комплекс ", duration_sec: null, poster_url: null },
  ],
  attachments: [{ name: "Подготовительный этап.pdf", url: "https://cdn.test/a.pdf", size_bytes: "1082539", mime: "application/pdf" }],
  links: [{ kind: "telegram_chat", url: "https://t.me/+chat", title: "Чат «КАМНИ 26 ПОТОКА»" }],
})

test("the lesson form sends every stage-2 field in the contract's shape", () => {
  const result = toLessonBody(filled(), courseLessons)

  assert.equal(result.ok, true)
  assert.deepEqual(result.body, {
    title: "Дыхательная гимнастика",
    body: "Текст",
    section: "Первая неделя программы",
    section_order: 1,
    summary: "Как дышать по Стрельниковой",
    cover_url: "https://cdn.test/cover.jpg",
    available_from_day: 3,
    videos: [
      { url: "https://cdn.test/v1.mp4", duration_sec: 225, poster_url: "https://cdn.test/p.jpg" },
      { url: "https://cdn.test/v2.mp4", title: "Комплекс" },
    ],
    attachments: [{ name: "Подготовительный этап.pdf", url: "https://cdn.test/a.pdf", size_bytes: 1082539, mime: "application/pdf" }],
    links: [{ kind: "telegram_chat", url: "https://t.me/+chat", title: "Чат «КАМНИ 26 ПОТОКА»" }],
    video_url: "https://cdn.test/v1.mp4",
  })
})

test("empty optional fields go as null and empty lists, an empty row is dropped", () => {
  const result = toLessonBody({ ...fromLesson(), title: "Урок", videos: [emptyVideo()] })

  assert.equal(result.ok, true)
  assert.equal(result.body.section, null)
  assert.equal(result.body.section_order, null)
  assert.equal(result.body.available_from_day, null)
  assert.deepEqual(result.body.videos, [])
  assert.equal(result.body.video_url, null)
})

test("the lesson form names the first thing to fix", () => {
  const bad = (patch) => toLessonBody({ ...filled(), ...patch })

  assert.equal(bad({ title: " " }).error, "Укажите название урока.")
  assert.match(bad({ available_from_day: "0" }).error, /День открытия/)
  assert.match(bad({ available_from_day: "2.5" }).error, /День открытия/)
  assert.match(bad({ videos: [{ ...emptyVideo(), title: "Без ссылки" }] }).error, /^Видео 1:/)
  assert.match(bad({ attachments: [{ name: "", url: "https://cdn.test/a.pdf", size_bytes: "", mime: null }] }).error, /^Файл 1: укажите имя/)
  assert.match(bad({ links: [{ kind: "youtube", url: "https://youtu.be/x", title: "" }] }).error, /^Ссылка 1: укажите текст/)
  assert.match(bad({ cover_url: "cover.jpg" }).error, /обложку/)
})

test("a lesson from before stage 2 opens in the form with its video_url as the one video", () => {
  const values = fromLesson({ id: "l1", course_id: "c", title: "Старый", order: 0, body: "", video_url: "https://cdn.test/old.mp4" })

  assert.deepEqual(values.videos, [{ url: "https://cdn.test/old.mp4", title: "", duration_sec: null, poster_url: null }])
  assert.equal(values.available_from_day, "")
})

test("the section's place: an existing section keeps it, a new one goes last, the edited lesson does not count", () => {
  assert.deepEqual(sectionNames(courseLessons), ["Подготовка", "Первая неделя программы"])
  assert.equal(sectionOrderFor("Подготовка", courseLessons), 0)
  assert.equal(sectionOrderFor("Бонусные уроки", courseLessons), 2)
  assert.equal(sectionOrderFor("Первая неделя программы", courseLessons, "l3"), 1)
  assert.equal(sectionOrderFor(null, courseLessons), null)
})

test("the course page groups lessons the way the school does: runs of one section", () => {
  const groups = lessonGroups([...courseLessons, { id: "l4", section: null, order: 3 }])

  assert.deepEqual(
    groups.map((group) => [group.title, group.lessons.map((lesson) => lesson.id)]),
    [
      ["Подготовка", ["l1", "l2"]],
      ["Первая неделя программы", ["l3"]],
      [null, ["l4"]],
    ]
  )
})

test("moveRow moves one row and leaves the list alone at either end", () => {
  assert.deepEqual(moveRow(["a", "b", "c"], 2, -1), ["a", "c", "b"])
  assert.deepEqual(moveRow(["a", "b", "c"], 0, 1), ["b", "a", "c"])
  assert.deepEqual(moveRow(["a", "b"], 0, -1), ["a", "b"])
  assert.deepEqual(moveRow(["a", "b"], 1, 1), ["a", "b"])
})

test("the course's start and access length go to the API as a Moscow midnight and a number", () => {
  assert.deepEqual(courseScheduleBody("2026-10-19", "97"), { ok: true, start_date: "2026-10-19T00:00:00+03:00", access_days: 97 })
  assert.deepEqual(courseScheduleBody("", ""), { ok: true, start_date: null, access_days: null })
  assert.equal(courseScheduleBody("", "0").ok, false)
  assert.equal(dateInputValue("2026-10-18T21:00:00Z"), "2026-10-19")
  assert.equal(dateInputValue(null), "")
})

test("the course page's lesson list and fields carry no fixed px widths and no table", () => {
  for (const file of ["routes/courses/course-detail/course-detail.tsx", "routes/courses/lesson-form/lesson-form.tsx"]) {
    const source = readFileSync(join(SRC, file), "utf8")
    assert.doesNotMatch(source, /\b(?:max-)?w-\[\d+px\]/, `${file}: a fixed px width`)
    assert.doesNotMatch(source, /<table|<Table\b/, `${file}: a table outside TableScroll`)
  }
})
