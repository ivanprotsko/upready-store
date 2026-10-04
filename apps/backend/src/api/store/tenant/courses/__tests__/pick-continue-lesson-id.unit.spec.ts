import { pickContinueLessonId } from "../store-course-helpers";
import type { LessonRow } from "../../../../tenants/courses/course-helpers";
import type { ProgressRow } from "../store-course-helpers";

const lesson = (id: string, order: number): LessonRow => ({
  id,
  tenant_id: "ten_1",
  course_id: "crs_1",
  title: `Lesson ${order}`,
  order,
  body: "",
  video_url: null,
});

const viewed = (lessonId: string, viewedAt: string): ProgressRow => ({
  id: `cprg_${lessonId}`,
  tenant_id: "ten_1",
  customer_id: "cus_1",
  course_id: "crs_1",
  lesson_id: lessonId,
  viewed_at: viewedAt,
});

describe("pickContinueLessonId", () => {
  const lessons = [lesson("l1", 0), lesson("l2", 1), lesson("l3", 2)];

  it("is null while no lesson is viewed, so the card opens the contents", () => {
    expect(pickContinueLessonId(lessons, [])).toBeNull();
  });

  it("is null for a course with no lessons", () => {
    expect(pickContinueLessonId([], [viewed("l1", "2026-10-01T10:00:00Z")])).toBeNull();
  });

  it("is null when the only progress rows belong to lessons outside the course", () => {
    expect(pickContinueLessonId(lessons, [viewed("l_gone", "2026-10-01T10:00:00Z")])).toBeNull();
  });

  it("opens the first lesson not viewed yet", () => {
    const rows = [viewed("l1", "2026-10-01T10:00:00Z")];

    expect(pickContinueLessonId(lessons, rows)).toBe("l2");
  });

  it("follows the course's lesson order, not the order the lessons were viewed in", () => {
    // l3 was viewed after l1, and l2 was skipped: the gap is what is left to watch.
    const rows = [viewed("l3", "2026-10-02T10:00:00Z"), viewed("l1", "2026-10-01T10:00:00Z")];

    expect(pickContinueLessonId(lessons, rows)).toBe("l2");
  });

  it("reads the lesson order from `order`, not from the array the module returned", () => {
    const shuffled = [lesson("l3", 2), lesson("l1", 0), lesson("l2", 1)];
    const rows = [viewed("l1", "2026-10-01T10:00:00Z")];

    expect(pickContinueLessonId(shuffled, rows)).toBe("l2");
  });

  it("opens the lesson viewed last once every lesson is viewed", () => {
    const rows = [
      viewed("l1", "2026-10-01T10:00:00Z"),
      viewed("l3", "2026-10-02T10:00:00Z"),
      viewed("l2", "2026-10-03T10:00:00Z"),
    ];

    expect(pickContinueLessonId(lessons, rows)).toBe("l2");
  });

  it("takes Date values the module returns as well as ISO strings", () => {
    const rows: ProgressRow[] = [
      { ...viewed("l1", ""), viewed_at: new Date("2026-10-03T10:00:00Z") },
      { ...viewed("l2", ""), viewed_at: new Date("2026-10-01T10:00:00Z") },
      { ...viewed("l3", ""), viewed_at: new Date("2026-10-02T10:00:00Z") },
    ];

    expect(pickContinueLessonId(lessons, rows)).toBe("l1");
  });

  it("gives a tie on viewed_at to the later lesson", () => {
    const at = "2026-10-01T10:00:00Z";
    const rows = [viewed("l2", at), viewed("l1", at), viewed("l3", at)];

    expect(pickContinueLessonId(lessons, rows)).toBe("l3");
  });
});
