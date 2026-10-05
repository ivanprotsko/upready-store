import { LIVER_COURSE, LIVER_LESSONS } from "../course-content/liver-lessons";
import {
  LIVER_COURSE_EN,
  LIVER_LESSON_TITLES_EN,
  courseTranslationPlan,
} from "../course-content/liver-lessons-en";

/**
 * t-2026-10-04-19: the English of «Очищение печени» has to cover every lesson
 * the course has, in English only, or cherkashino.com/en shows a Russian line
 * in the «Course programme» list, which falls back to the base text for a
 * lesson with no English row and says nothing about it.
 */

const CYRILLIC = /[А-Яа-яЁё]/;

describe("«Очищение печени» in English", () => {
  it("has an English title for each of the 23 lessons and nothing else", () => {
    expect(LIVER_LESSONS).toHaveLength(23);
    expect(Object.keys(LIVER_LESSON_TITLES_EN).sort()).toEqual(
      LIVER_LESSONS.map((lesson) => lesson.title).sort(),
    );
  });

  it("is English: no Cyrillic, no blank, no two lessons with the same title", () => {
    const english = [
      LIVER_COURSE_EN.en.title,
      LIVER_COURSE_EN.en.description,
      ...Object.values(LIVER_LESSON_TITLES_EN),
    ];

    for (const text of english) {
      expect(text.trim()).toBe(text);
      expect(text).not.toBe("");
      expect(CYRILLIC.test(text)).toBe(false);
    }
    expect(new Set(Object.values(LIVER_LESSON_TITLES_EN)).size).toBe(LIVER_LESSONS.length);
  });

  it("translates the Russian base the seed writes", () => {
    expect(LIVER_COURSE_EN.ru).toEqual({ title: LIVER_COURSE.title, description: LIVER_COURSE.description });
  });
});

describe("courseTranslationPlan", () => {
  const course = { id: "crs_1", title: LIVER_COURSE.title, description: LIVER_COURSE.description };
  const lessons = LIVER_LESSONS.map((lesson, index) => ({
    id: `lsn_${String(index + 1).padStart(2, "0")}`,
    order: index + 1,
    title: lesson.title,
  }));

  it("writes one row for the course and one per lesson, in course order", () => {
    const plan = courseTranslationPlan(course, [...lessons].reverse());

    expect(plan.courseSkipped).toBe(false);
    expect(plan.skippedLessons).toEqual([]);
    expect(plan.rows).toHaveLength(24);
    expect(plan.rows[0]).toEqual({ reference: "course", reference_id: "crs_1", fields: LIVER_COURSE_EN.en });
    expect(plan.rows[1]).toEqual({
      reference: "lesson",
      reference_id: "lsn_01",
      fields: { title: "Welcome video from Oksana" },
    });
    expect(plan.rows[23].reference_id).toBe("lsn_23");
  });

  it("skips a lesson the owner renamed rather than hand it another lesson's English", () => {
    const renamed = lessons.map((lesson) => (lesson.order === 5 ? { ...lesson, title: "Новое название" } : lesson));

    const plan = courseTranslationPlan(course, renamed);

    expect(plan.rows).toHaveLength(23);
    expect(plan.rows.some((row) => row.reference_id === "lsn_05")).toBe(false);
    expect(plan.skippedLessons).toEqual([{ id: "lsn_05", order: 5, title: "Новое название" }]);
  });

  it("skips the course row when its own Russian changed", () => {
    const plan = courseTranslationPlan({ ...course, description: "Другое описание" }, lessons);

    expect(plan.courseSkipped).toBe(true);
    expect(plan.rows.every((row) => row.reference === "lesson")).toBe(true);
    expect(plan.rows).toHaveLength(23);
  });
});
