import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockIcon from "../../shared/block-icon"
import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { HeroSplitButton, HeroSplitProps } from "./props"

const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] motion-safe:transition-colors xsmall:w-auto"

/** The template's button layer (`--layer-button-*`), the theme's primary pair without a template. */
const PRIMARY =
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))] hover:opacity-90"

const SECONDARY = "border-[var(--border)] bg-transparent text-ui-fg-base hover:bg-ui-bg-base-hover"

function Cta({ button, label, role }: { button: HeroSplitButton; label: string; role: "cta-primary" | "cta-secondary" }) {
  const className = clx(BUTTON, role === "cta-primary" ? PRIMARY : SECONDARY)
  return button.href.startsWith("/") ? (
    <Link data-role={role} href={button.href} className={className}>
      {label}
    </Link>
  ) : (
    <a data-role={role} href={button.href} className={className}>
      {label}
    </a>
  )
}

/**
 * `hero/split` (t-2026-10-12-33): the first screen as text beside a picture, the 16.09 lab's
 * `hero/split` that four of its seven templates open with. The text says what the shop sells
 * and why here: a label, the page's `h1`, a lead, up to two buttons and up to four checked
 * facts. The picture is one of the shop's own (`ImageRef`), cropped to the template's photo
 * shape, or whole on a padded tile for a packshot.
 *
 * From 1024 px the text takes five parts and the picture six, on the side the template
 * names; below that the text comes first and the picture under it, the buttons full width
 * on a phone. The `h1` scales with `clamp()` and breaks a long word rather than overflow.
 *
 * With no title in the visitor's language, nor in English, nor in any other, it draws
 * nothing. With no picture, or one the shop no longer has, the text stands alone across the
 * full width: an empty frame is not an empty state.
 */
export default async function HeroSplit({
  eyebrow,
  title,
  lead,
  primary,
  secondary,
  facts,
  image,
  imageSide,
  imageFit,
  tone,
  height,
}: HeroSplitProps) {
  const locale = await getLocale()
  const heading = pickText(title, locale)

  if (!heading) {
    return null
  }

  const picture = image ? await resolveImageRef(image, locale) : null
  const label = pickText(eyebrow, locale)
  const description = pickText(lead, locale)
  const primaryLabel = primary ? pickText(primary.label, locale) : null
  const secondaryLabel = secondary ? pickText(secondary.label, locale) : null
  const factLines = (facts ?? []).map((fact) => pickText(fact, locale)).filter((line): line is string => !!line)
  const pictureFirst = !!picture && imageSide === "left"

  return (
    <BlockSection block="hero/split" locale={locale}>
      <div
        className={clx(
          "grid grid-cols-1 items-center gap-8 small:gap-12",
          picture && (pictureFirst ? "small:grid-cols-[6fr_5fr]" : "small:grid-cols-[5fr_6fr]"),
          height === "tall" && "small:min-h-[70vh]",
          tone === "muted" && "rounded-[var(--radius)] bg-[var(--muted)] p-6 small:p-12"
        )}
      >
        <div
          className={clx(
            "flex min-w-0 flex-col items-start gap-[calc(1.5rem*var(--layer-density,1))]",
            tone === "panel" &&
              "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 small:p-10"
          )}
        >
          {label ? (
            <p data-role="label" className="text-xs font-medium uppercase tracking-[0.08em] text-ui-fg-muted">
              {label}
            </p>
          ) : null}
          <h1
            data-role="heading"
            className="max-w-full text-balance break-words text-[clamp(2rem,1.4rem+2.6vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-ui-fg-base"
          >
            {heading}
          </h1>
          {description ? (
            <p data-role="description" className="max-w-[60ch] text-pretty text-xl text-ui-fg-subtle">
              {description}
            </p>
          ) : null}
          {(primary && primaryLabel) || (secondary && secondaryLabel) ? (
            <div data-role="cta-group" className="flex w-full flex-col gap-3 xsmall:w-auto xsmall:flex-row xsmall:flex-wrap">
              {primary && primaryLabel ? <Cta button={primary} label={primaryLabel} role="cta-primary" /> : null}
              {secondary && secondaryLabel ? (
                <Cta button={secondary} label={secondaryLabel} role="cta-secondary" />
              ) : null}
            </div>
          ) : null}
          {factLines.length ? (
            <ul className="flex flex-col gap-2 xsmall:flex-row xsmall:flex-wrap xsmall:gap-x-6">
              {factLines.map((line, index) => (
                <li key={index} className="flex items-center gap-2 text-base text-ui-fg-subtle">
                  <span data-role="icon" className="inline-flex shrink-0 text-[var(--primary)]">
                    <BlockIcon name="badge-check" className="size-5" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {picture ? (
          <div
            data-role="hero-image"
            className={clx(
              "relative aspect-[var(--layer-photo-aspect,1/1)] max-h-[70vh] w-full overflow-hidden rounded-[var(--radius)]",
              imageFit === "contain" && "bg-[var(--muted)]",
              pictureFirst && "small:order-first",
              height === "tall" && "small:aspect-auto small:h-full small:max-h-none small:min-h-[70vh] small:self-stretch"
            )}
          >
            <Image
              src={picture.url}
              alt={picture.alt}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className={imageFit === "contain" ? "object-contain p-6 small:p-10" : "object-cover"}
            />
          </div>
        ) : null}
      </div>
    </BlockSection>
  )
}
