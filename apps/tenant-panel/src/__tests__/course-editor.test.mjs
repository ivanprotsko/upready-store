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

test("the lesson form refuses an empty title before it ever calls onSubmit", () => {
  const source = readFileSync(join(SRC, "routes/courses/lesson-form/lesson-form.tsx"), "utf8")

  const guardIndex = source.indexOf("if (!title)")
  const submitIndex = source.indexOf("await onSubmit(")
  assert.notEqual(guardIndex, -1, "the empty-title guard is missing")
  assert.notEqual(submitIndex, -1, "the onSubmit call is missing")
  assert.ok(guardIndex < submitIndex, "the title guard must run before the request is sent")

  const guardBlock = source.slice(guardIndex, submitIndex)
  assert.ok(/\breturn\b/.test(guardBlock), "an empty title must stop the submit, not just warn")
})

test("the lesson form refuses a video link with no http(s) scheme before it ever calls onSubmit", () => {
  const source = readFileSync(join(SRC, "routes/courses/lesson-form/lesson-form.tsx"), "utf8")

  const guardIndex = source.indexOf("VIDEO_URL_PATTERN.test")
  const submitIndex = source.indexOf("await onSubmit(")
  assert.notEqual(guardIndex, -1, "the video-url guard is missing")
  assert.ok(guardIndex < submitIndex, "the video-url guard must run before the request is sent")
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
