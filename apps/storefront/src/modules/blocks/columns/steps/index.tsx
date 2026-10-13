import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import BlockIcon from "../../shared/block-icon"
import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import { BUTTON_LABEL, type Step, type StepsProps } from "./props"

/** From 1024px in `row`: a column a step, never more than the steps shown. */
const ROW: Record<number, string> = {
  2: "small:grid-cols-2",
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
  5: "small:grid-cols-5",
}

const BUTTON_CLASS = clx(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
)

/**
 * The step's title is the column title of `columns/multicolumn`: 20 px, 24 px from `small`, between the section's
 * description and its heading (`shared/section-type.ts`), so the two blocks on one page keep one size per role.
 */
const titleClass = "text-balance text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl"

/**
 * The number: 36 px, 48 px from `small`, in the template's display face (`--font-display`, the page's own face
 * without a template pair). 1.5× the section heading at both widths (QR-TYPE-SCALE) and weight 500 (QR-WEIGHT).
 * Lining figures: a serif pair such as Cormorant Garamond sets old-style ones by default, a «1» at x-height and a
 * «3» below the line.
 */
const numberClass =
  "font-[family-name:var(--font-display,inherit)] text-4xl font-medium leading-none lining-nums tabular-nums text-[var(--primary)] small:text-5xl"

type Shown = { key: number; title: string; text: string | null; icon: Step["icon"] }

/**
 * `columns/steps` (t-2026-10-12-33, R2 build list item 12): «Как сделать заказ» in two to five numbered steps,
 * ordering through the site, a call or a messenger. Measured against the «Как сделать заказ» row of Tilda's
 * plants shop (record T786): a numbered label, a title and two or three lines a step, four in a row.
 *
 * - An `<ol>`: a screen reader reads the order, so the drawn number and its line are `aria-hidden`.
 * - `layout: row`: from 1024px the steps stand side by side, a column each, and a line runs from each number to
 *   the next step; the last step has none. `list`: one under another in a reading column at every width.
 *   Under 1024px a row is a list too: the number on the left, the line from it down to the next step.
 * - A step's icon (`phone`, `message-circle`) stands before its title, in the title's line.
 * - `button`: one primary button under the steps, the template's button layer.
 * - `tone: muted` puts the steps and the button on one `--muted` panel with the template's radius.
 *
 * A step with no title in the visitor's language, nor in English, nor in any other, is skipped; with fewer than
 * two left the block draws nothing, as one step is not a sequence. Colours, type, radius and rhythm come from the
 * theme and the template's layers only.
 */
export default async function Steps({ header, steps, button, layout, tone }: StepsProps) {
  const locale = await getLocale()

  const shown: Shown[] = steps.flatMap((step, key) => {
    const title = pickText(step.title, locale)
    return title ? [{ key, title, text: pickText(step.text, locale), icon: step.icon }] : []
  })
  if (shown.length < 2) {
    return null
  }

  const row = layout === "row"
  const muted = tone === "muted"
  const label = button ? pickText(button.label, locale) ?? pickText(BUTTON_LABEL, locale) : null

  const cta =
    button && label ? (
      button.href.startsWith("/") ? (
        <Link href={button.href} data-role="cta-primary" className={BUTTON_CLASS}>
          {label}
        </Link>
      ) : (
        <a href={button.href} data-role="cta-primary" className={BUTTON_CLASS}>
          {label}
        </a>
      )
    ) : null

  return (
    <BlockSection block="columns/steps" locale={locale} header={header}>
      <div
        className={clx(
          "flex flex-col items-start gap-[var(--layer-space-8,2rem)]",
          muted &&
            "rounded-[var(--radius)] bg-[var(--muted)] p-[var(--layer-space-6,1.5rem)] small:p-[var(--layer-space-8,2rem)]"
        )}
      >
        <ol
          className={clx(
            "flex w-full max-w-2xl flex-col",
            row && clx("small:grid small:max-w-none small:gap-x-[var(--layer-space-6,1.5rem)]", ROW[shown.length])
          )}
        >
          {shown.map((step, index) => {
            const last = index === shown.length - 1
            return (
              <li key={step.key} data-role="step" className={clx("flex gap-4", row && "small:flex-col")}>
                <div
                  aria-hidden="true"
                  data-step-marker=""
                  className={clx("flex w-10 shrink-0 flex-col items-center small:w-12", row && "small:w-auto small:flex-row small:gap-4")}
                >
                  <span data-step-number="" className={numberClass}>
                    {index + 1}
                  </span>
                  {last ? null : (
                    <span
                      data-step-line=""
                      className={clx("my-2 w-px flex-1 bg-[var(--border)]", row && "small:my-0 small:h-px small:w-auto")}
                    />
                  )}
                </div>
                <div
                  className={clx(
                    "flex min-w-0 flex-1 flex-col gap-2",
                    !last && "pb-[var(--layer-space-8,2rem)]",
                    row && "small:pb-0"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {step.icon ? (
                      <span data-role="icon" className="mt-1 flex shrink-0 text-ui-fg-subtle">
                        <BlockIcon name={step.icon} className="size-5 small:size-6" />
                      </span>
                    ) : null}
                    <h3 data-role="card-title" className={titleClass}>
                      {step.title}
                    </h3>
                  </div>
                  {step.text ? (
                    <p data-role="description" className={SECTION_TYPE.description}>
                      {step.text}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
        {cta}
      </div>
    </BlockSection>
  )
}
