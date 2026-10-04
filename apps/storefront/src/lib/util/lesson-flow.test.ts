import { describe, expect, it } from "vitest"

import {
  flowTargetHref,
  isVideoWatched,
  lessonFlowTargets,
  playedSeconds,
  type FlowLesson,
} from "./lesson-flow"

describe("playedSeconds", () => {
  it("adds up the ranges and counts an overlap once", () => {
    expect(playedSeconds([[0, 10]])).toBe(10)
    expect(
      playedSeconds([
        [0, 10],
        [5, 20],
        [30, 40],
      ])
    ).toBe(30)
    expect(
      playedSeconds([
        [30, 40],
        [0, 10],
        [10, 20],
      ])
    ).toBe(30)
  })

  it("ignores empty, reversed and non-finite ranges", () => {
    expect(playedSeconds([])).toBe(0)
    expect(
      playedSeconds([
        [5, 5],
        [9, 3],
        [0, Number.NaN],
        [0, Number.POSITIVE_INFINITY],
      ])
    ).toBe(0)
  })
})

describe("isVideoWatched (Р1: the end, and 90 % of the length actually played)", () => {
  const duration = 100

  it("counts a video watched through to its end", () => {
    expect(isVideoWatched({ ended: true, played: [[0, 100]], duration })).toBe(true)
  })

  it("counts exactly 90 % and not a second less", () => {
    expect(
      isVideoWatched({
        ended: true,
        played: [
          [0, 50],
          [60, 100],
        ],
        duration,
      })
    ).toBe(true)
    expect(
      isVideoWatched({
        ended: true,
        played: [
          [0, 49],
          [60, 100],
        ],
        duration,
      })
    ).toBe(false)
  })

  it("does not count a seek to the end", () => {
    expect(
      isVideoWatched({
        ended: true,
        played: [
          [0, 3],
          [97, 100],
        ],
        duration,
      })
    ).toBe(false)
  })

  it("does not count before the end, however much has played", () => {
    expect(isVideoWatched({ ended: false, played: [[0, 99]], duration })).toBe(false)
  })

  it("counts a twice-watched stretch once", () => {
    expect(
      isVideoWatched({
        ended: true,
        played: [
          [0, 50],
          [0, 50],
          [95, 100],
        ],
        duration,
      })
    ).toBe(false)
  })

  it("goes by the end alone for a video with no finite length", () => {
    expect(isVideoWatched({ ended: true, played: [], duration: Number.NaN })).toBe(true)
    expect(isVideoWatched({ ended: true, played: [], duration: Number.POSITIVE_INFINITY })).toBe(
      true
    )
    expect(isVideoWatched({ ended: false, played: [], duration: Number.NaN })).toBe(false)
  })
})

describe("lessonFlowTargets («Назад» and «Дальше»)", () => {
  const lessons: FlowLesson[] = [
    { id: "l1", has_quiz: true },
    { id: "l2", has_quiz: false },
    { id: "l3", has_quiz: true },
    { id: "l4", has_quiz: false },
  ]

  it("from the first lesson goes back to the contents and on to its test", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "l1", test: false })).toEqual({
      back: { kind: "contents" },
      next: { kind: "test", lessonId: "l1" },
    })
  })

  it("from a test goes back to its lesson and on to the next lesson", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "l1", test: true })).toEqual({
      back: { kind: "lesson", lessonId: "l1" },
      next: { kind: "lesson", lessonId: "l2" },
    })
  })

  it("goes back to the previous lesson's test when it has one, else to that lesson", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "l2", test: false }).back).toEqual({
      kind: "test",
      lessonId: "l1",
    })
    expect(lessonFlowTargets(lessons, { lessonId: "l3", test: false }).back).toEqual({
      kind: "lesson",
      lessonId: "l2",
    })
  })

  it("from a lesson with no test goes on to the next lesson", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "l2", test: false }).next).toEqual({
      kind: "lesson",
      lessonId: "l3",
    })
  })

  it("finishes the course after the last lesson, or after its test", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "l4", test: false }).next).toEqual({
      kind: "finish",
    })
    expect(
      lessonFlowTargets([...lessons.slice(0, 3)], { lessonId: "l3", test: true }).next
    ).toEqual({ kind: "finish" })
  })

  it("sends a lesson the course does not have, or a test it does not have, to the contents", () => {
    expect(lessonFlowTargets(lessons, { lessonId: "gone", test: false })).toEqual({
      back: { kind: "contents" },
      next: { kind: "contents" },
    })
    expect(lessonFlowTargets(lessons, { lessonId: "l2", test: true })).toEqual({
      back: { kind: "contents" },
      next: { kind: "contents" },
    })
  })

  it("handles a one-lesson course", () => {
    expect(lessonFlowTargets([{ id: "only", has_quiz: false }], { lessonId: "only", test: false })).toEqual({
      back: { kind: "contents" },
      next: { kind: "finish" },
    })
  })
})

describe("flowTargetHref", () => {
  it("puts every step under the course in the account", () => {
    expect(flowTargetHref("pechen", { kind: "contents" })).toBe("/account/courses/pechen")
    expect(flowTargetHref("pechen", { kind: "lesson", lessonId: "l1" })).toBe(
      "/account/courses/pechen/lessons/l1"
    )
    expect(flowTargetHref("pechen", { kind: "test", lessonId: "l1" })).toBe(
      "/account/courses/pechen/lessons/l1/test"
    )
    expect(flowTargetHref("pechen", { kind: "finish" })).toBe("/account/courses")
  })
})
