import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { RichTextProps } from "./props"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = {
  "cta-primary": clx(
    "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-5 text-sm font-medium transition-opacity hover:opacity-90",
    "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
    focusRing
  ),
  "cta-secondary": clx(
    "inline-flex min-h-11 items-center rounded-[var(--radius)] px-1 text-sm font-medium text-ui-fg-base underline decoration-[var(--border)] decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--foreground)]",
    focusRing
  ),
} as const

/**
 * `text/rich-text` (t-2026-10-12-33, R1 build list item 1): the shop's own words as a home
 * section, «О нас», a brand story, a delivery promise. An eyebrow, a heading, plain paragraphs
 * with their line breaks, up to two buttons; left or centred, a 42rem or 56rem column, on the
 * page or on a `--muted` panel. Several stand on one page, so it brings no outer spacing of its
 * own: `BlockSection` sets the rhythm, `--layer-density` the inside.
 *
 * It draws its own heading stack rather than the shell's header, because the header is always
 * left and 42rem, and this block centres and widens; the type is the same family of tokens, one
 * step larger, measured against the Shopify catalogue's rich-text (Sense, 30/36 px at 1280). The
 * storefront's `text-3xl` is 2rem with no line height of its own, hence `leading-tight`: 32/40.
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
            "rounded-[var(--radius)] bg-[var(--muted)] px-6 py-[calc(2.5rem*var(--layer-density,1))] xsmall:px-10 small:px-12 small:py-[calc(3.5rem*var(--layer-density,1))]"
        )}
      >
        <div
          className={clx(
            "flex flex-col gap-[calc(1.25rem*var(--layer-density,1))]",
            width === "wide" ? "max-w-4xl" : "max-w-2xl",
            centred && "mx-auto items-center text-center"
          )}
        >
          {label || title ? (
            <div data-role="section-header" className="flex flex-col gap-3">
              {label ? (
                <p data-role="label" className="text-sm font-medium text-ui-fg-muted">
                  {label}
                </p>
              ) : null}
              {title ? (
                <h2
                  data-role="heading"
                  className="text-balance text-2xl font-semibold leading-tight tracking-[-0.02em] text-ui-fg-base small:text-3xl"
                >
                  {title}
                </h2>
              ) : null}
            </div>
          ) : null}
          {body.length ? (
            <div className="flex flex-col gap-4">
              {body.map((line, index) => (
                <p
                  key={index}
                  data-role="description"
                  className="whitespace-pre-line text-pretty text-base leading-relaxed text-ui-fg-subtle small:text-lg"
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
