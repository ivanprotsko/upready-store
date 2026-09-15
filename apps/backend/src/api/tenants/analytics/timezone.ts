/**
 * t17-analytics round 1, finding 3: "today" was computed in UTC, so an order
 * placed between 00:00 and 03:00 Moscow time landed in "yesterday" and the
 * "today" card closed at 03:00 MSK instead of midnight local. This shop's own
 * timezone, IANA form, one value for the whole deployment — the platform has
 * no per-tenant timezone setting yet, and the finding accepts "at least a
 * fixed shop timezone" as the fix. `Europe/Moscow` matches the audience this
 * multi-tenant deployment is built for (`LOCALE_PIN` in the storefront).
 */
export const ANALYTICS_TIMEZONE = process.env.ANALYTICS_TIMEZONE || "Europe/Moscow";

/**
 * Minutes a given instant is AHEAD of UTC in `timeZone` (positive east of
 * Greenwich, e.g. +180 for Moscow). Read from `Intl.DateTimeFormat` rather
 * than a hardcoded offset, so a change of DST rules is not a code change.
 */
const offsetMinutesAt = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return Math.round((asUtc - date.getTime()) / 60000);
};

/** The UTC instant of local midnight, in `timeZone`, of the day `date` falls on. */
export const startOfDayInZone = (date: Date, timeZone: string): Date => {
  const offsetMinutes = offsetMinutesAt(date, timeZone);
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);
  const localMidnightAsUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(localMidnightAsUtc - offsetMinutes * 60000);
};

/** `YYYY-MM-DD` of `date` as read in `timeZone`, for chart labels and the period boundary. */
export const formatDateInZone = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
};

/** Parses `YYYY-MM-DD` as a calendar day in `timeZone`, not as UTC midnight. */
export const parseDateInZone = (value: string, timeZone: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    // Also accept a full ISO instant (the panel may send one); its OWN day,
    // read in the zone, is what the caller wants.
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : startOfDayInZone(parsed, timeZone);
  }
  const [, year, month, day] = match;
  // A UTC guess of that calendar day is enough to resolve which zone-day it
  // names; `startOfDayInZone` then anchors it correctly even near a DST edge.
  const utcGuess = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return startOfDayInZone(utcGuess, timeZone);
};
