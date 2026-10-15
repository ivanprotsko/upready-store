import { lessonCountsByCourse } from "../lesson-counts";

describe("lessonCountsByCourse (t-2026-10-14-01, G4 courses list)", () => {
  it("counts the lessons of each course", () => {
    const counts = lessonCountsByCourse([
      { course_id: "course_a" },
      { course_id: "course_b" },
      { course_id: "course_a" },
    ]);

    expect(counts.get("course_a")).toBe(2);
    expect(counts.get("course_b")).toBe(1);
  });

  it("knows nothing of a course with no lessons, so the route reads 0 for it", () => {
    expect(lessonCountsByCourse([]).get("course_a")).toBeUndefined();
  });
});
