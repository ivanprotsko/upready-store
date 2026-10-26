/**
 * The type rhythm of the journal (t-2026-10-05-03), taken from the chrxnasdmds «Журнал
 * здоровья»: its three display sizes and its small-caps eyebrow, as class strings. Sizes,
 * line heights and tracking only. The typeface is the theme's own, and every colour is a
 * token class at the call site.
 */

/** The hero's title and an article's section heading: 32 to 52 px. */
export const DISPLAY_2 =
  "text-[length:clamp(2rem,3.4vw,3.25rem)] leading-[1.1] tracking-[-0.015em] font-medium"

/**
 * A page title of the journal (the masthead, the hero's lead article, an article's own
 * title): the second size, the first from 1280 px.
 */
export const DISPLAY_TITLE = `${DISPLAY_2} medium:text-[length:clamp(2.5rem,4.4vw,4.25rem)] medium:leading-[1.05] medium:tracking-[-0.02em]`

/** An article's sub-heading and the «read next» title: 24 to 32 px. */
export const DISPLAY_3 =
  "text-[length:clamp(1.5rem,2.4vw,2rem)] leading-[1.2] tracking-[-0.01em] font-medium"

/** The rubric over a title: 11 px small caps, wide tracking. */
export const EYEBROW = "text-[0.6875rem] leading-none uppercase tracking-[0.16em] font-medium"

/** The heading of a section of the journal page: small caps, beside a hairline. */
export const SECTION_TITLE =
  "text-xs small:text-sm uppercase tracking-[0.16em] font-medium whitespace-nowrap"

/** The two buttons that close an article. */
export const BUTTON_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-rounded px-6 text-sm font-medium transition-colors duration-200"
export const BUTTON_OUTLINE = `${BUTTON_BASE} border border-ui-fg-interactive text-ui-fg-interactive hover:bg-ui-bg-subtle`
export const BUTTON_FILLED = `${BUTTON_BASE} bg-ui-button-inverted text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover`

/** A round arrow of a rail. */
export const ARROW_CLASS =
  "grid h-9 w-9 place-items-center rounded-full border border-ui-border-base bg-ui-bg-base text-ui-fg-base transition-colors duration-200 hover:bg-ui-bg-subtle disabled:opacity-40 disabled:hover:bg-ui-bg-base small:h-10 small:w-10"
