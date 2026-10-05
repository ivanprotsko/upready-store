import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ivan 05.10 (ask-20261005-061005-2e78): the course's progress is a green
 * strip pinned to the bottom edge, full width, 8 px high, with «Назад» and
 * «Дальше» in the corners; «Отметить просмотренным» is gone, the lesson counts
 * by itself. Asserted on source, the convention `(lesson)/layout.test.ts`
 * uses; the rules themselves are unit-tested in `lib/util/lesson-flow.test.ts`.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(join(here, path), "utf8")
const lesson = read("index.tsx")
const test = read("../course-lesson-test/index.tsx")
const bar = read("../lesson-flow-bar/index.tsx")
const credit = read("../lesson-credit/index.tsx")

describe("the lesson page after ask 2e78", () => {
  it("has no «Отметить просмотренным», no progress block on top and no old prev/next links", () => {
    expect(lesson).not.toContain("LessonViewedButton")
    expect(lesson).not.toContain("course-progress")
    expect(lesson).not.toContain('"prev-lesson"')
    expect(lesson).not.toContain('"next-lesson"')
    expect(
      existsSync(join(here, "../../../products/components/lesson-viewed-button/index.tsx"))
    ).toBe(false)
  })

  it("counts the lesson by its video or its text and posts it to the viewed route", () => {
    expect(lesson).toContain("<LessonCredit")
    expect(lesson).toContain("<LessonVideo")
    expect(lesson).toContain("<LessonReadMarker")
    expect(credit).toContain("markLessonViewed(courseId, lessonId)")
  })

  it("puts the same bottom bar under the lesson and under its test", () => {
    expect(lesson).toContain("<LessonCreditBar")
    expect(test).toContain("<LessonQuiz")
    expect(read("../lesson-quiz/index.tsx")).toContain("<LessonFlowBar")
  })
})

describe("the bottom bar", () => {
  it("is pinned to the bottom edge across the whole width", () => {
    expect(bar).toMatch(/className="[^"]*\bfixed\b[^"]*\binset-x-0\b[^"]*\bbottom-0\b/)
  })

  it("draws the progress as an 8 px strip in the theme's success colour", () => {
    expect(bar).toMatch(/role="progressbar"[\s\S]*className="h-2 w-full/)
    expect(bar).toContain("bg-status-success")
    expect(bar).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    for (const attribute of ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) {
      expect(bar).toContain(attribute)
    }
  })

  it("keeps the controls above the phone's home indicator", () => {
    expect(bar).toContain("env(safe-area-inset-bottom)")
  })
})
