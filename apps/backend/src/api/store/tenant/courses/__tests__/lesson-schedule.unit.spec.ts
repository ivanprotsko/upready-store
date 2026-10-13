import { accessStartOf, accessUntil, dayStartsAt, foldSections, lessonLock } from "../lesson-schedule";

/**
 * t-2026-10-13-29 stage 2: lessons that open on a day of the program and the
 * school's groups. Days are counted in Moscow time, the shop's timezone, day 1
 * being the day access starts, the way the liver course's own day schedules
 * count («День 1» … «День 7»).
 */

const MSK = "Europe/Moscow";

describe("accessStartOf", () => {
  it("is the grant when the course has no stream start", () => {
    expect(accessStartOf({ granted_at: "2026-10-20T09:00:00.000Z" }, { start_date: null })?.toISOString()).toBe(
      "2026-10-20T09:00:00.000Z",
    );
  });

  it("is the stream start for a buyer who paid before it", () => {
    const start = accessStartOf({ granted_at: "2026-10-10T09:00:00.000Z" }, { start_date: "2026-10-19T00:00:00.000Z" });
    expect(start?.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("is the grant for a buyer who paid after the stream started", () => {
    const start = accessStartOf({ granted_at: "2026-10-21T09:00:00.000Z" }, { start_date: "2026-10-19T00:00:00.000Z" });
    expect(start?.toISOString()).toBe("2026-10-21T09:00:00.000Z");
  });

  it("falls back to the row's created_at, and is null with nothing to count from", () => {
    expect(accessStartOf({ created_at: new Date("2026-10-20T09:00:00.000Z") }, {})?.toISOString()).toBe(
      "2026-10-20T09:00:00.000Z",
    );
    expect(accessStartOf(null, {})).toBeNull();
  });
});

describe("lessonLock", () => {
  // Paid at 23:30 Moscow time on 19 October (20:30 UTC): day 1 is the 19th in Moscow.
  const paid = new Date("2026-10-19T20:30:00.000Z");

  it("opens a lesson of day 6 at Moscow midnight five days after the day access started", () => {
    const lock = lessonLock({ available_from_day: 6 }, paid, new Date("2026-10-23T12:00:00.000Z"), MSK);

    expect(lock).toEqual({ locked: true, opens_at: "2026-10-23T21:00:00.000Z" });
  });

  it("counts the day in the shop's timezone, not in UTC", () => {
    // 22:00 UTC on the 19th is already the 20th in Moscow, so day 2 is the 21st there.
    const lateUtc = new Date("2026-10-19T22:00:00.000Z");
    expect(lessonLock({ available_from_day: 2 }, lateUtc, lateUtc, MSK).opens_at).toBe("2026-10-20T21:00:00.000Z");
    expect(lessonLock({ available_from_day: 2 }, paid, paid, MSK).opens_at).toBe("2026-10-19T21:00:00.000Z");
  });

  it("is open from the instant it opens", () => {
    expect(lessonLock({ available_from_day: 6 }, paid, new Date("2026-10-23T21:00:00.000Z"), MSK)).toEqual({
      locked: false,
      opens_at: "2026-10-23T21:00:00.000Z",
    });
  });

  it("keeps null, 0 and 1 open at once with no date", () => {
    for (const day of [null, undefined, 0, 1]) {
      expect(lessonLock({ available_from_day: day }, paid, paid, MSK)).toEqual({ locked: false, opens_at: null });
    }
  });

  it("leaves a lesson open when there is no start to count from", () => {
    expect(lessonLock({ available_from_day: 6 }, null, paid, MSK)).toEqual({ locked: false, opens_at: null });
  });
});

describe("dayStartsAt and accessUntil", () => {
  it("crosses a month end by the calendar", () => {
    expect(dayStartsAt(new Date("2026-10-30T10:00:00.000Z"), 4, MSK).toISOString()).toBe("2026-11-01T21:00:00.000Z");
  });

  it("ends access at midnight after its last day", () => {
    // 90 days from 19 October, day 1 included: the last is 16 January, access ends as the 17th begins.
    expect(accessUntil(new Date("2026-10-19T09:00:00.000Z"), 90, MSK)).toBe("2027-01-16T21:00:00.000Z");
  });

  it("is null without a limit or a start", () => {
    expect(accessUntil(new Date("2026-10-19T09:00:00.000Z"), null, MSK)).toBeNull();
    expect(accessUntil(null, 90, MSK)).toBeNull();
  });
});

describe("foldSections", () => {
  const lesson = (id: string, section: string | null, sectionOrder: number | null = null) => ({
    id,
    section,
    section_order: sectionOrder,
  });

  it("groups the lymph course's lessons by module, in the modules' order", () => {
    const groups = foldSections([
      lesson("a", "Подготовка", 1),
      lesson("b", "Подготовка", 1),
      lesson("c", "Первая неделя программы", 2),
      lesson("d", "Бонусные уроки", 5),
      lesson("e", "Основная программа", 3),
    ]);

    expect(groups.map((group) => [group.title, group.order, group.lessons.map((row) => row.id)])).toEqual([
      ["Подготовка", 1, ["a", "b"]],
      ["Первая неделя программы", 2, ["c"]],
      ["Основная программа", 3, ["e"]],
      ["Бонусные уроки", 5, ["d"]],
    ]);
  });

  it("puts a lesson back into its section's group even when another section came between", () => {
    const groups = foldSections([lesson("a", "Подготовка", 1), lesson("b", "Бонус", 2), lesson("c", "Подготовка", 1)]);

    expect(groups.map((group) => group.lessons.map((row) => row.id))).toEqual([["a", "c"], ["b"]]);
  });

  it("is one untitled group for a course without sections, lessons in the order given", () => {
    const groups = foldSections([lesson("a", null), lesson("b", " "), lesson("c", null)]);

    expect(groups).toEqual([{ title: null, order: 0, lessons: [lesson("a", null), lesson("b", " "), lesson("c", null)] }]);
  });

  it("orders groups without a section_order as 0, in the order they first appear", () => {
    const groups = foldSections([lesson("a", "Модуль"), lesson("b", null), lesson("c", "Второй", 2)]);

    expect(groups.map((group) => [group.title, group.order])).toEqual([
      ["Модуль", 0],
      [null, 0],
      ["Второй", 2],
    ]);
  });
});
