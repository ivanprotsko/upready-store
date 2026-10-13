import { ANALYTICS_TIMEZONE, formatDateInZone, parseDateInZone } from "../../../tenants/analytics/timezone";

/**
 * When a buyer's lessons open, and how the school groups them
 * (t-2026-10-13-29 stage 2, the GetCourse courses).
 *
 * A buyer's access starts on the later of two days: the day the grant was
 * written (`course_entitlement.granted_at`) and the stream's start
 * (`course.start_date`), so whoever buys before the stream begins starts with
 * it. A lesson with `available_from_day` N opens at midnight of day N of that
 * access, day 1 being the day it starts: the numbering of the course's own day
 * schedules («День 1» … «День 7»), so a lesson for day 6 says 6. Null, 0 and 1
 * open at once. Days are counted in the shop's timezone, the one the
 * analytics count days in (`ANALYTICS_TIMEZONE`).
 */

type Instant = Date | string | null | undefined;

const toDate = (value: Instant): Date | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The first instant of the buyer's access, or null when neither date is known. */
export const accessStartOf = (
  entitlement: { granted_at?: Instant; created_at?: Instant } | null | undefined,
  course: { start_date?: Instant },
): Date | null => {
  const granted = toDate(entitlement?.granted_at) ?? toDate(entitlement?.created_at);
  const streamStart = toDate(course.start_date);

  if (granted && streamStart) {
    return granted > streamStart ? granted : streamStart;
  }

  return granted ?? streamStart;
};

/** Local midnight, in `timeZone`, of day `day` counted from the day `start` falls on (day 1). */
export const dayStartsAt = (start: Date, day: number, timeZone: string = ANALYTICS_TIMEZONE): Date => {
  const [year, month, date] = formatDateInZone(start, timeZone).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, date + Math.max(day, 1) - 1));
  const ymd = target.toISOString().slice(0, 10);

  return parseDateInZone(ymd, timeZone) ?? target;
};

export type LessonLock = { locked: boolean; opens_at: string | null };

/**
 * Whether the lesson is still closed for a buyer whose access started at
 * `start`. `opens_at` is the instant it opens (or opened), for a lesson that
 * opens on a day; null for one open from the start. Without a start there is
 * nothing to count from, and the lesson is open.
 */
export const lessonLock = (
  lesson: { available_from_day?: number | null },
  start: Date | null,
  now: Date = new Date(),
  timeZone: string = ANALYTICS_TIMEZONE,
): LessonLock => {
  const day = lesson.available_from_day;
  if (day === null || day === undefined || day <= 1 || !start) {
    return { locked: false, opens_at: null };
  }

  const opensAt = dayStartsAt(start, day, timeZone);
  return { locked: now.getTime() < opensAt.getTime(), opens_at: opensAt.toISOString() };
};

/**
 * The instant access ends for a course with `access_days`: midnight after its
 * last day, day 1 being the start. Null without a limit or a start.
 */
export const accessUntil = (
  start: Date | null,
  accessDays: number | null | undefined,
  timeZone: string = ANALYTICS_TIMEZONE,
): string | null => {
  if (!start || !accessDays || accessDays < 1) {
    return null;
  }

  return dayStartsAt(start, accessDays + 1, timeZone).toISOString();
};

export type SectionGroup<L> = { title: string | null; order: number; lessons: L[] };

/**
 * The school's lesson list in groups: every lesson with the same `section`
 * goes into one group, in the order the lessons come (pass them sorted, the
 * way `byOrderAsc` sorts them). A group's `order` is the `section_order` of
 * its first lesson, 0 when that has none, so lessons outside any section come
 * first; groups with the same `order` keep the order they first appear in. A
 * course without sections is one group with the title null.
 */
export const foldSections = <L extends { section?: string | null; section_order?: number | null }>(
  lessons: L[],
): SectionGroup<L>[] => {
  const groups = new Map<string, SectionGroup<L> & { first: number }>();

  lessons.forEach((lesson, index) => {
    const title = lesson.section?.trim() || null;
    const id = title ?? "";
    let group = groups.get(id);
    if (!group) {
      group = { title, order: lesson.section_order ?? 0, lessons: [], first: index };
      groups.set(id, group);
    }
    group.lessons.push(lesson);
  });

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.first - b.first)
    .map(({ title, order, lessons: grouped }) => ({ title, order, lessons: grouped }));
};
