import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseHref, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { readInstant } from "./time"

export type CountdownButton = {
  /** A path inside the shop (`/store`, the locale is added) or an `https://` address. */
  href: string
  label: LocalizedText
}

/** After the end the block goes, or a message stands where the clock was. */
export type AfterEnd = "hide" | { message: LocalizedText }

export type CountdownTimerProps = {
  /** The end, ISO 8601 with its offset: `2026-11-30T23:59:00+03:00`. Null: nothing to count to. */
  endsAt: string | null
  heading: LocalizedText
  text: LocalizedText
  button: CountdownButton | null
  afterEnd: AfterEnd
  /** `block`: a section of its own, centred, the clock in large cells; `inline`: one bar in the content measure. */
  style: "inline" | "block"
  /** The word under each number. */
  daysLabel: LocalizedText
  hoursLabel: LocalizedText
  minutesLabel: LocalizedText
  secondsLabel: LocalizedText
  /** The line under the clock; `{date}` becomes the end's date, time and offset. */
  deadlineLabel: LocalizedText
}

/** The block's own words while it is `lab` (BLOCK-CONTRACT.md §2): props, not the catalogs. */
export const BUTTON_LABEL: LocalizedText = { ru: "К акции", en: "Shop the sale" }
export const ENDED_MESSAGE: LocalizedText = { ru: "Акция завершилась", en: "The offer has ended" }
/** Column titles under the numbers, so the same word is right at 1, 3 and 5. */
export const DAYS_LABEL: LocalizedText = { ru: "дни", en: "days" }
export const HOURS_LABEL: LocalizedText = { ru: "часы", en: "hours" }
export const MINUTES_LABEL: LocalizedText = { ru: "минуты", en: "minutes" }
export const SECONDS_LABEL: LocalizedText = { ru: "секунды", en: "seconds" }
export const DEADLINE_LABEL: LocalizedText = { ru: "Акция до {date}", en: "Offer ends {date}" }

const unit = (fallback: LocalizedText) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max: 20, fallback })

/** Absent is null; a string must name one moment, which an ISO date and time without its offset does not. */
const parseEndsAt = (value: unknown, path: string): PropsResult<string | null> => {
  if (value === undefined || value === null) return { ok: true, value: null }
  return typeof value === "string" && readInstant(value)
    ? { ok: true, value }
    : { ok: false, errors: [`${path} must be an ISO date and time with its offset, such as 2026-11-30T23:59:00+03:00`] }
}

/** `"hide"`, absent included, or `{ message }`. */
const parseAfterEnd = (value: unknown, path: string): PropsResult<AfterEnd> => {
  if (value === undefined || value === null || value === "hide") return { ok: true, value: "hide" }
  if (typeof value === "string") return { ok: false, errors: [`${path} must be "hide" or { message }`] }
  return parseObject<{ message: LocalizedText }>(value, path, {
    message: (message, messagePath) => parseLocalizedText(message, messagePath, { max: 140, fallback: ENDED_MESSAGE }),
  })
}

/** The line must say when, or it reads «Акция до» and stops. */
const parseDeadlineLabel = (value: unknown, path: string): PropsResult<LocalizedText> => {
  const result = parseLocalizedText(value, path, { max: 60, fallback: DEADLINE_LABEL })
  if (!result.ok) return result
  const missing = Object.entries(result.value)
    .filter(([, line]) => !line.includes("{date}"))
    .map(([code]) => `${path}.${code} must contain {date}`)
  return missing.length ? { ok: false, errors: missing } : result
}

export function parseCountdownTimerProps(input: unknown): PropsResult<CountdownTimerProps> {
  return parseProps<CountdownTimerProps>(input, "countdown/timer", {
    endsAt: parseEndsAt,
    heading: (value, path) => parseLocalizedText(value, path, { max: 60, fallback: {} }),
    text: (value, path) => parseLocalizedText(value, path, { max: 140, fallback: {} }),
    button: (value, path) =>
      parseObject<CountdownButton>(
        value,
        path,
        {
          href: (href, hrefPath) => parseHref(href, hrefPath, { required: true }),
          label: (label, labelPath) => parseLocalizedText(label, labelPath, { max: 30, fallback: BUTTON_LABEL }),
        },
        { optional: true }
      ),
    afterEnd: parseAfterEnd,
    style: (value, path) => parseEnum(value, path, ["inline", "block"] as const, { fallback: "block" }),
    daysLabel: unit(DAYS_LABEL),
    hoursLabel: unit(HOURS_LABEL),
    minutesLabel: unit(MINUTES_LABEL),
    secondsLabel: unit(SECONDS_LABEL),
    deadlineLabel: parseDeadlineLabel,
  })
}
