import { MedusaError } from "@medusajs/framework/utils";

/**
 * The calendar section of «Аналитика»: the period one request folds, on the
 * shop's clock.
 *
 * `../analytics.ts` folds the rows and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** The period the screen opens on, and the number it SAYS it chose. */
export const DEFAULT_PERIOD_DAYS = 30;

/** The longest period one request may fold: a year, leap day included. */
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * The calendar of the shop.
 *
 * A day on this screen is a day of the SHOP's clock, not of UTC: an order
 * placed at 01:00 in Moscow is 22:00 UTC the day before, and a UTC cut would
 * put it into yesterday's column and close «сегодня» three hours early. The
 * zone is an argument; the route passes `ANALYTICS_TIMEZONE`, the same zone
 * the shop's own «Аналитика» counts its days in
 * (`api/tenants/analytics/timezone.ts`).
 */
export type AnalyticsPeriod = {
  /** The first instant of `from_day` in the shop's zone. */
  from: Date;
  /** The first instant AFTER `to_day` in the shop's zone: the bound is exclusive. */
  until: Date;
  /** The days the screen prints, `YYYY-MM-DD`, both inclusive. */
  from_day: string;
  to_day: string;
  days: number;
  /** True when the caller named no day and got the last 30 days. */
  is_default: boolean;
  time_zone: string;
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone: building one costs more than formatting with it. */
const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
};

/** The wall clock of `at` in `timeZone`, as numbers. */
const wallClock = (at: Date, timeZone: string) => {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
};

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` of the instant `at` on the shop's calendar. */
export const dayIn = (at: Date, timeZone: string): string => {
  const clock = wallClock(at, timeZone);
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
};

/**
 * `dayIn` for many rows. Every real zone offset is a multiple of 15 minutes,
 * so two instants in the same quarter of an hour share a day; the cache keeps
 * a month of orders to about 3 000 formatter calls instead of one per line.
 */
export const dayReader = (timeZone: string): ((at: Date) => string) => {
  const cache = new Map<number, string>();
  return (at: Date) => {
    const slot = Math.floor(at.getTime() / 900_000);
    let day = cache.get(slot);
    if (day === undefined) {
      day = dayIn(at, timeZone);
      cache.set(slot, day);
    }
    return day;
  };
};

/** Minutes the zone is ahead of UTC at the instant `at` (+180 for Moscow). */
const offsetMinutesAt = (at: Date, timeZone: string): number => {
  const clock = wallClock(at, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
};

/**
 * The instant the calendar day `day` begins in `timeZone`. The offset is read
 * twice, the second time at the instant the first guess gave, so a day that
 * starts next to a clock change is anchored by the offset in force at its own
 * midnight.
 */
export const midnightIn = (day: string, timeZone: string): Date => {
  const [year, month, date] = day.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, date);
  const first = guess - offsetMinutesAt(new Date(guess), timeZone) * 60_000;
  return new Date(guess - offsetMinutesAt(new Date(first), timeZone) * 60_000);
};

/** `day` moved by `count` calendar days, on the calendar alone. */
export const shiftDay = (day: string, count: number): string => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string): number => {
  const at = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
};

/** A real calendar day `YYYY-MM-DD`, or `null`: «2026-02-30» is not one. */
const parseDay = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const day = match[0];
  return shiftDay(day, 0) === day ? day : null;
};

/**
 * The period the query asks for, or the last 30 days of the shop's calendar
 * with today included.
 *
 * `from` and `to` are calendar days, `YYYY-MM-DD`, read on the SHOP's
 * calendar. Anything else is a 400 and not a silently ignored filter: a screen
 * that claims «с 1 сентября» while it folds the default 30 days would be a
 * wrong answer with no sign on it.
 *
 * Days after the shop's today are not measured yet, so `to` stops at today:
 * dividing a month's sales by days that have not happened would shrink every
 * pace on the screen. The answer carries the days it used, and the screen
 * prints those. A half-open period is legal: «с 1 сентября» runs to today,
 * «по 10 сентября» starts 30 days before it.
 *
 * `now` is an argument: the tests pin it, and a function that reads the clock
 * itself cannot be measured (rule 17a).
 */
export const resolveAnalyticsPeriod = (
  query: { from?: unknown; to?: unknown },
  now: Date,
  timeZone: string,
): AnalyticsPeriod => {
  const asked = (key: "from" | "to"): string | null => {
    const raw = query[key];
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }
    const day = parseDay(raw);
    if (!day) {
      throw invalid(`${key}: ожидается дата вида 2026-09-30, пришло «${String(raw).slice(0, 40)}»`);
    }
    return day;
  };
  const askedFrom = asked("from");
  const askedTo = asked("to");

  const today = dayIn(now, timeZone);
  const toDay = askedTo && askedTo < today ? askedTo : today;
  const fromDay = askedFrom ?? shiftDay(toDay, -(DEFAULT_PERIOD_DAYS - 1));

  if (fromDay > toDay) {
    throw invalid(`Период начинается ${fromDay}, позже своего конца ${toDay}`);
  }
  const days = daysBetween(fromDay, toDay) + 1;
  if (days > MAX_PERIOD_DAYS) {
    throw invalid(`Период длиной ${days} дн. длиннее года; выберите не больше ${MAX_PERIOD_DAYS} дн.`);
  }

  return {
    from: midnightIn(fromDay, timeZone),
    until: midnightIn(shiftDay(toDay, 1), timeZone),
    from_day: fromDay,
    to_day: toDay,
    days,
    is_default: !askedFrom && !askedTo,
    time_zone: timeZone,
  };
};

/**
 * Every calendar day of the period, in order.
 *
 * The chart draws THIS list and not the days that happen to carry an order: a
 * day with no sales is a real zero measured over a real day, and dropping it
 * would draw a chart that skips a dead week without saying so.
 */
export const daysOf = (period: Pick<AnalyticsPeriod, "from_day" | "days">): string[] =>
  Array.from({ length: period.days }, (_, index) => shiftDay(period.from_day, index));
