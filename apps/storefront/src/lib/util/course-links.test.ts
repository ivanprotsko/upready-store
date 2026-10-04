import { describe, expect, it } from "vitest"

import {
  continueCourseHref,
  courseContentsHref,
  courseLessonHref,
} from "./course-links"

describe("course links", () => {
  it("puts a course's contents and its lessons in the account", () => {
    expect(courseContentsHref("ochishchenie-pecheni")).toBe(
      "/account/courses/ochishchenie-pecheni"
    )
    expect(courseLessonHref("ochishchenie-pecheni", "les_01")).toBe(
      "/account/courses/ochishchenie-pecheni/lessons/les_01"
    )
  })

  it("encodes a slug or an id that is not a plain URL segment", () => {
    expect(courseLessonHref("курс", "a/b")).toBe(
      "/account/courses/%D0%BA%D1%83%D1%80%D1%81/lessons/a%2Fb"
    )
  })

  it("opens the contents while no lesson is viewed", () => {
    expect(
      continueCourseHref({ slug: "ochishchenie-pecheni", continue_lesson_id: null })
    ).toBe("/account/courses/ochishchenie-pecheni")
  })

  it("opens the lesson the backend picked once a lesson is viewed", () => {
    expect(
      continueCourseHref({
        slug: "ochishchenie-pecheni",
        continue_lesson_id: "les_02",
      })
    ).toBe("/account/courses/ochishchenie-pecheni/lessons/les_02")
  })
})
