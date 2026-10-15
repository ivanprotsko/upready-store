/**
 * How many lessons each course has, for the «Уроки» column of the owner's
 * course list (t-2026-10-14-01, G4). The list reads every lesson of the tenant
 * once, `id` and `course_id` only, and counts them here; a course with no
 * lessons reads 0. Plain TS, so its unit spec runs without the framework.
 */
export const lessonCountsByCourse = (
  lessons: { course_id: string }[],
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    counts.set(lesson.course_id, (counts.get(lesson.course_id) ?? 0) + 1);
  }
  return counts;
};
