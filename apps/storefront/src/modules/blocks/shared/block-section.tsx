import { clx } from "@medusajs/ui"
import type { ReactNode } from "react"

import { Link } from "@i18n/navigation"

import type { BlockId } from "../types"
import { pickText } from "./localized-text"
import type { SectionHeader } from "./section-header"
import { SECTION_TYPE } from "./section-type"

/**
 * The outer shell of a home section (t-2026-10-12-33, BLOCK-CONTRACT.md §3). Every block but a
 * full-width bar wraps itself in it, so the sections of a template share one rhythm and one
 * heading style:
 *
 * - half the template's section gap above and half below (`--layer-section-gap`, 3rem without a
 *   template), so two sections stand one gap apart;
 * - the content container (`width: "content"`), or the page's full width for a banner or a
 *   slideshow (`"full"`); the header stays in the container either way;
 * - the header, when it has any words: eyebrow, heading, description and a «see all» link, in the one
 *   section type of `section-type.ts`;
 * - `data-block`, the block's id, for the shots and for whoever reads the page.
 *
 * `locale` is the visitor's (`getLocale()` in the block), so the shell stays a plain component.
 */
export default function BlockSection({
  block,
  locale,
  header,
  width = "content",
  children,
}: {
  block: BlockId
  locale: string
  header?: SectionHeader | null
  width?: "content" | "full"
  children?: ReactNode
}) {
  const eyebrow = pickText(header?.eyebrow, locale)
  const heading = pickText(header?.heading, locale)
  const description = pickText(header?.description, locale)
  const seeAll = header?.seeAll
  const seeAllLabel = seeAll ? pickText(seeAll.label, locale) : null

  // A 44px target (QR-HIT), as wide as its words: the header is a column below `small`, where a
  // stretched link would be a 328px bar. `-mb-3` lets the box grow into the gap under the header, so
  // the words stay level with the heading's last line. No corner: the link has no surface, and the
  // global focus ring takes `border-radius: inherit` (globals.css) whatever the class says.
  const linkClass = clx(
    "-mb-3 inline-flex min-h-11 shrink-0 items-center self-start text-ui-fg-interactive underline-offset-4 hover:text-ui-fg-interactive-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive small:self-auto",
    SECTION_TYPE.seeAll
  )

  return (
    <section data-block={block} className="py-[calc(var(--layer-section-gap,3rem)/2)]">
      {eyebrow || heading || description || (seeAll && seeAllLabel) ? (
        <header
          data-role="section-header"
          className="content-container mb-[var(--layer-space-6,1.5rem)] flex flex-col gap-3 small:flex-row small:items-end small:justify-between small:gap-8"
        >
          <div className="flex max-w-2xl flex-col gap-2">
            {eyebrow ? (
              <p data-role="label" className={SECTION_TYPE.label}>
                {eyebrow}
              </p>
            ) : null}
            {heading ? (
              <h2 data-role="heading" className={SECTION_TYPE.heading}>
                {heading}
              </h2>
            ) : null}
            {description ? (
              <p data-role="description" className={SECTION_TYPE.description}>
                {description}
              </p>
            ) : null}
          </div>
          {seeAll && seeAllLabel ? (
            seeAll.href.startsWith("/") ? (
              <Link data-role="cta-secondary" href={seeAll.href} className={linkClass}>
                {seeAllLabel}
              </Link>
            ) : (
              <a data-role="cta-secondary" href={seeAll.href} className={linkClass}>
                {seeAllLabel}
              </a>
            )
          ) : null}
        </header>
      ) : null}
      {width === "content" ? <div className="content-container">{children}</div> : children}
    </section>
  )
}
