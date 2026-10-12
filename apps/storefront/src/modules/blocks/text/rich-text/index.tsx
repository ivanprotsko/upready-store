import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { RichTextProps } from "./props"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = {
  "cta-primary": clx(
    "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
    "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
    focusRing
  ),
  "cta-secondary": clx(
    "inline-flex min-h-11 items-center rounded-[var(--radius)] px-1 text-base font-medium text-ui-fg-base underline decoration-[var(--muted-foreground)] decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--foreground)] motion-reduce:transition-none small:text-sm",
    focusRing
  ),
} as const

/**
 * `text/rich-text` (t-2026-10-12-33, R1 build list item 1): the shop's own words as a home
 * section, «О нас», a brand story, a delivery promise. An eyebrow, a heading, plain paragraphs
 * with their line breaks, up to two buttons; left or centred, a 42rem or 56rem column (the
 * paragraphs keep a reading measure, `max-w-prose`, in both), on the page or on a `--muted` panel.
 * Several stand on one page, so it brings no outer spacing of its own: `BlockSection` sets the
 * rhythm, `--layer-density` the inside.
 *
 * It draws its own heading stack rather than the shell's header, because the header is always
 * left and 42rem, and this block centres and widens; the type is the shell's, `SECTION_TYPE` of
 * `shared/section-type.ts`, measured against the Shopify catalogue's rich-text (Sense, 30/36 px at
 * 1280). The paragraphs take the description's size and keep their own leading and line breaks.
 *
 * The sizes pass `pnpm template:check` (the lab's QR rules): neighbouring sizes ≥ 1.15× apart,
 * heading ÷ body ≥ 1.5, so 12 / 16 / 16 / 24 px at 360 (eyebrow, buttons, body, heading) and
 * 12 / 14 / 18 / 32 px from 1024; spacing on the 4·8·12·16·24·32·48·64 scale.
 *
 * With no heading and no paragraph in the visitor's language, nor in English, nor in any other,
 * it draws nothing: an eyebrow and a button alone are not a section.
 */
export default async function RichText({
  eyebrow,
  heading,
  paragraphs,
  primary,
  secondary,
  align,
  width,
  tone,
}: RichTextProps) {
  const locale = await getLocale()
  const title = pickText(heading, locale)
  const body = paragraphs.map((paragraph) => pickText(paragraph, locale)).filter((line): line is string => !!line)

  if (!title && body.length === 0) {
    return null
  }

  const label = pickText(eyebrow, locale)
  const buttons = (
    [
      ["cta-primary", primary],
      ["cta-secondary", secondary],
    ] as const
  ).flatMap(([role, button]) => {
    const text = button ? pickText(button.label, locale) : null
    return button && text ? [{ role, href: button.href, text }] : []
  })
  const centred = align === "center"

  return (
    <BlockSection block="text/rich-text" locale={locale}>
      <div
        className={clx(
          tone === "muted" &&
            "rounded-[var(--radius)] bg-[var(--muted)] px-6 py-[calc(2rem*var(--layer-density,1))] xsmall:px-12 small:px-16 small:py-[calc(4rem*var(--layer-density,1))]"
        )}
      >
        <div
          className={clx(
            "flex flex-col gap-[calc(1.5rem*var(--layer-density,1))]",
            width === "wide" ? "max-w-4xl" : "max-w-2xl",
            centred && "mx-auto items-center text-center"
          )}
        >
          {label || title ? (
            <div data-role="section-header" className="flex flex-col gap-3">
              {label ? (
                <p data-role="label" className={SECTION_TYPE.label}>
                  {label}
                </p>
              ) : null}
              {title ? (
                <h2 data-role="heading" className={SECTION_TYPE.heading}>
                  {title}
                </h2>
              ) : null}
            </div>
          ) : null}
          {body.length ? (
            <div className="flex max-w-prose flex-col gap-4">
              {body.map((line, index) => (
                <p
                  key={index}
                  data-role="description"
                  className={clx(SECTION_TYPE.description, "whitespace-pre-line leading-relaxed")}
                >
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {buttons.length ? (
            <div
              className={clx(
                "mt-[calc(0.75rem*var(--layer-density,1))] flex flex-wrap items-center gap-x-6 gap-y-3",
                centred && "justify-center"
              )}
            >
              {buttons.map(({ role, href, text }) =>
                href.startsWith("/") ? (
                  <Link key={role} href={href} data-role={role} className={BUTTON_CLASS[role]}>
                    {text}
                  </Link>
                ) : (
                  <a key={role} data-role={role} href={href} className={BUTTON_CLASS[role]}>
                    {text}
                  </a>
                )
              )}
            </div>
          ) : null}
        </div>
      </div>
    </BlockSection>
  )
}
