import { computeCourseProgress } from "../store-course-helpers";
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

const progress = (lessonId: string): ProgressRow => ({
  id: `cprg_${lessonId}`,
  tenant_id: "ten_1",
  customer_id: "cus_1",
  course_id: "crs_1",
  lesson_id: lessonId,
  viewed_at: new Date(),
});

describe("computeCourseProgress", () => {
  it("is 0/0/0 for a course with no lessons", () => {
    expect(computeCourseProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("counts only lessons that belong to the course, not stray progress rows", () => {
    const lessons = [lesson("l1", 0), lesson("l2", 1), lesson("l3", 2)];
    const rows = [progress("l1"), progress("l3"), progress("l_from_another_course")];

    expect(computeCourseProgress(lessons, rows)).toEqual({ completed: 2, total: 3, percent: 67 });
  });

  it("never double-counts a lesson viewed twice", () => {
    const lessons = [lesson("l1", 0)];
    const rows = [progress("l1"), progress("l1")];

    expect(computeCourseProgress(lessons, rows)).toEqual({ completed: 1, total: 1, percent: 100 });
  });

  it("rounds to the nearest whole percent", () => {
    const lessons = [lesson("l1", 0), lesson("l2", 1), lesson("l3", 2)];
    const rows = [progress("l1")];

    // 1/3 = 33.33...% -> rounds to 33, never floors to 0 or ceils to 34-with-drift.
    expect(computeCourseProgress(lessons, rows).percent).toBe(33);
  });
});
