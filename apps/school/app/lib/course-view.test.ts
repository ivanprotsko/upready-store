import { describe, expect, it } from "vitest"
import { accessUntilText, attachmentText, courseSections, opensText, videoCaption, videoDuration } from "./course-view"
import { lessonMediaUrl } from "./media"
import type { CourseLessonRow } from "./types"
import { resumeAt, resumeKey } from "./video-resume"

const row = (id: string, section: string | null | undefined): CourseLessonRow => ({
  id,
  title: id,
  order: 0,
  viewed_at: null,
  has_quiz: false,
  section,
})

describe("courseSections", () => {
  it("takes the API's sections when it sends them", () => {
    const sections = [{ title: "Подготовка", order: 0, lessons: [row("a", "Подготовка")] }]

    expect(courseSections({ lessons: [], sections })).toBe(sections)
  })

  it("folds the flat list by runs of one section, in order", () => {
    const folded = courseSections({
      lessons: [row("a", "Подготовка"), row("b", "Подготовка"), row("c", "Неделя 1"), row("d", "Подготовка")],
    })

    expect(folded.map((section) => [section.title, section.lessons.map((lesson) => lesson.id)])).toEqual([
      ["Подготовка", ["a", "b"]],
      ["Неделя 1", ["c"]],
      ["Подготовка", ["d"]],
    ])
  })

  it("is one group with no title for a course without sections, from an older API too", () => {
    const folded = courseSections({ lessons: [row("a", null), row("b", undefined), row("c", "  ")] })

    expect(folded).toHaveLength(1)
    expect(folded[0]?.title).toBeNull()
    expect(folded[0]?.lessons).toHaveLength(3)
  })
})

describe("the words of dates, videos and files", () => {
  const now = new Date("2026-10-13T12:00:00Z")

  it("says the day a lesson opens, in Moscow time, with the year only when it is another one", () => {
    expect(opensText("2026-10-18T00:00:00+03:00", now)).toBe("Откроется 18 октября")
    expect(opensText("2026-10-17T21:00:00Z", now)).toBe("Откроется 18 октября")
    expect(opensText("2027-01-03T00:00:00+03:00", now)).toBe("Откроется 3 января 2027")
    expect(opensText(null, now)).toBe("Скоро откроется")
  })

  it("says the access date with its year", () => {
    expect(accessUntilText("2027-01-19T00:00:00+03:00")).toBe("Доступ до 19 января 2027")
  })

  it("writes a video's length as a clock", () => {
    expect(videoDuration(225)).toBe("3:45")
    expect(videoDuration(6192)).toBe("1:43:12")
    expect(videoDuration(0)).toBeNull()
    expect(videoDuration(null)).toBeNull()
  })

  it("captions a video by its title, else by its place among several, and its length", () => {
    expect(videoCaption({ url: "v", title: "Комплекс", duration_sec: 60 }, 0, 1)).toBe("Комплекс · 1:00")
    expect(videoCaption({ url: "v", duration_sec: 225 }, 1, 3)).toBe("Видео 2 из 3 · 3:45")
    expect(videoCaption({ url: "v" }, 0, 1)).toBeNull()
  })

  it("words a file like the text's own file link, with its size when known", () => {
    expect(attachmentText({ name: "Подготовительный этап.pdf", url: "u", size_bytes: 1258291 })).toBe(
      "Скачать «Подготовительный этап.pdf» — PDF, 1,2 МБ",
    )
    expect(attachmentText({ name: "Меню", url: "u", mime: "application/pdf" })).toBe("Скачать «Меню» — PDF")
    expect(attachmentText({ name: "Меню", url: "u" })).toBe("Скачать «Меню»")
  })
})

describe("lessonMediaUrl", () => {
  const route = (path: string) => `/app/_media?src=${encodeURIComponent(path)}`

  it("walks the backend's media route through the school, as a path or a URL on the API", () => {
    expect(lessonMediaUrl("/store/tenant/courses/c1/media?key=a%2Fb.mp4", "http://backend:9000", null)).toBe(
      route("/store/tenant/courses/c1/media?key=a%2Fb.mp4"),
    )
    expect(lessonMediaUrl("http://backend:9000/store/tenant/courses/c1/media?key=k", "http://backend:9000", null)).toBe(
      route("/store/tenant/courses/c1/media?key=k"),
    )
  })

  it("leaves any other address to mediaUrl", () => {
    expect(lessonMediaUrl("https://cdn.test/a.jpg", "http://backend:9000", null)).toBe("https://cdn.test/a.jpg")
    expect(lessonMediaUrl("/static/a.jpg", "http://backend:9000", "https://api.shop.test")).toBe("https://api.shop.test/static/a.jpg")
    expect(lessonMediaUrl("/static/a.jpg", "http://backend:9000", null)).toBeNull()
    expect(lessonMediaUrl(null, "http://backend:9000", null)).toBeNull()
  })
})

describe("the video resume", () => {
  it("keys the position by lesson and by video", () => {
    expect(resumeKey("lsn_1", 0)).not.toBe(resumeKey("lsn_1", 1))
  })

  it("seeks to the saved second, unless it is near either end or unreadable", () => {
    expect(resumeAt("120", 600)).toBe(120)
    expect(resumeAt("2", 600)).toBeNull()
    expect(resumeAt("598", 600)).toBeNull()
    expect(resumeAt("abc", 600)).toBeNull()
    expect(resumeAt(null, 600)).toBeNull()
    expect(resumeAt("120", Number.NaN)).toBe(120)
  })
})
