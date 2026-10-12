import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { HeroTypeProps } from "./props"

/** The template's button layer (`--layer-button-*`), the theme's primary pair without a template. */
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] px-6 text-base font-medium text-[var(--layer-button-fg,var(--primary-foreground))] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-safe:transition-colors xsmall:w-auto"

/**
 * The headline's size, on the type scale at the two widths the checks measure: `large` 36 px at
 * 360 and 60 px from 1238 px, `huge` 48 px at 360 and 96 px from 1258 px. The display font of the
 * theme or the template, the body font where neither names one. The leading comes after the size:
 * `clx` merges classes, and a `text-*` size drops a `leading-*` written before it.
 */
const HEADLINE = {
  large: "text-[clamp(2.25rem,0.5rem+4.2vw,3.75rem)] leading-[1.05] tracking-[-0.03em]",
  huge: "text-[clamp(3rem,0.5rem+7vw,6rem)] leading-[1.05] tracking-[-0.04em]",
} as const

/**
 * `hero/type` (t-2026-10-12-33): a typographic first screen, the 16.09 lab's `hero/type` that its
 * fashion template (moda) opens with. The headline is the one dominant: a label, the page's
 * `h1` very large in the display font, one short line, one button, and up to three small
 * pictures of the shop's own (`ImageRef`) under it.
 *
 * Left-aligned, the pictures stand beside the line and the button from 1024 px, under them
 * below that; centred, everything stacks on one axis. The `h1` scales with `clamp()` and keeps
 * a whole Russian word on its line at 360 px («Коллекция осень-зима» in `huge`), breaking one
 * only when the word alone is wider than the phone.
 *
 * With no title in the visitor's language, nor in English, nor in any other, it draws nothing.
 * A picture the shop no longer has is skipped, and with none the headline stands alone: an
 * empty frame is not an empty state.
 */
export default async function HeroType({ eyebrow, title, lead, primary, images, align, scale, rule }: HeroTypeProps) {
  const locale = await getLocale()
  const heading = pickText(title, locale)

  if (!heading) {
    return null
  }

  const resolved = await Promise.all((images ?? []).map((image) => resolveImageRef(image, locale)))
  const pictures = resolved.filter((picture): picture is NonNullable<typeof picture> => !!picture)
  const label = pickText(eyebrow, locale)
  const description = pickText(lead, locale)
  const primaryLabel = primary ? pickText(primary.label, locale) : null
  const center = align === "center"
  const items = center ? "items-center" : "items-start"

  const button =
    primary && primaryLabel ? (
      primary.href.startsWith("/") ? (
        <Link data-role="cta-primary" href={primary.href} className={BUTTON}>
          {primaryLabel}
        </Link>
      ) : (
        <a data-role="cta-primary" href={primary.href} className={BUTTON}>
          {primaryLabel}
        </a>
      )
    ) : null

  return (
    <BlockSection block="hero/type" locale={locale}>
      <div className={clx("flex flex-col gap-[calc(1.5rem*var(--layer-density,1))]", items, center && "text-center")}>
        {label ? (
          <div className={clx("flex w-full flex-col gap-3", items)}>
            <p data-role="label" className="text-xs font-medium uppercase tracking-[0.08em] text-ui-fg-muted">
              {label}
            </p>
            {rule ? <span aria-hidden="true" className="block h-px w-full bg-[var(--border)]" /> : null}
          </div>
        ) : null}
        <h1
          data-role="headline"
          className={clx(
            "max-w-full whitespace-pre-line text-balance break-words font-[family-name:var(--font-display,inherit)] font-medium text-ui-fg-base",
            HEADLINE[scale]
          )}
        >
          {heading}
        </h1>
        {description || button || pictures.length ? (
          <div
            className={clx(
              "flex w-full flex-col gap-8",
              items,
              !center && pictures.length && "small:flex-row small:items-end small:justify-between"
            )}
          >
            {description || button ? (
              <div className={clx("flex w-full flex-col gap-6 small:w-auto", items)}>
                {description ? (
                  <p data-role="description" className="max-w-[60ch] text-pretty text-xl text-ui-fg-subtle">
                    {description}
                  </p>
                ) : null}
                {button}
              </div>
            ) : null}
            {pictures.length ? (
              <ul className="flex shrink-0 gap-3 small:gap-4">
                {pictures.map((picture, index) => (
                  <li
                    key={index}
                    data-role="media"
                    className="relative aspect-[var(--layer-photo-aspect,1/1)] w-20 overflow-hidden rounded-[var(--radius)] xsmall:w-28 small:w-36"
                  >
                    <Image
                      src={picture.url}
                      alt={picture.alt}
                      fill
                      priority={index === 0}
                      sizes="(min-width: 1024px) 144px, (min-width: 512px) 112px, 80px"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </BlockSection>
  )
}
