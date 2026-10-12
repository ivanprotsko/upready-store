import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef, type BlockImage } from "@lib/data/block-image"

import BlockIcon from "../../shared/block-icon"
import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { MulticolumnItem, MulticolumnProps } from "./props"

/** From 1024px: the template's columns, never more than the items shown. */
const DESKTOP: Record<number, string> = {
  1: "small:grid-cols-1",
  2: "small:grid-cols-2",
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
  5: "small:grid-cols-5",
  6: "small:grid-cols-6",
}

/** From 512px: three at most, and four go two to a row, so a row of four never leaves an orphan. */
const TABLET: Record<number, string> = {
  1: "xsmall:grid-cols-1",
  2: "xsmall:grid-cols-2",
  3: "xsmall:grid-cols-3",
}
const tabletColumns = (columns: number) => (columns === 4 ? 2 : Math.min(columns, 3))

/**
 * Under 512px. `swipe` bleeds to the screen's edge through the content container's own 16px, so the next
 * card shows at the edge and fades out there (a mask, not a colour: the row goes on, nothing is cut off),
 * and is a grid again from 512px.
 */
const PHONE = {
  one: "grid grid-cols-1",
  two: "grid grid-cols-2",
  swipe:
    "no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 [mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)] xsmall:mx-0 xsmall:grid xsmall:overflow-visible xsmall:px-0 xsmall:[mask-image:none]",
} as const

/** Widths `next/image` picks a file for: the column's share of the page at each breakpoint. */
const sizesFor = (columns: number, mobile: MulticolumnProps["mobile"]) =>
  `(min-width: 1024px) ${Math.ceil(100 / columns)}vw, (min-width: 512px) ${Math.ceil(100 / tabletColumns(columns))}vw, ${
    mobile === "two" ? 50 : mobile === "swipe" ? 80 : 100
  }vw`

type Shown = {
  key: number
  title: string
  text: string | null
  link: { href: string; label: string } | null
  icon: MulticolumnItem["icon"]
  picture: BlockImage | null
}

/** The column's link is the section's «see all» in size and weight: one secondary link per section scale. */
const linkClass = clx(
  "inline-flex min-h-11 items-center text-ui-fg-interactive underline underline-offset-4 hover:text-ui-fg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive",
  SECTION_TYPE.seeAll
)

/**
 * The column's title sits between the section's description and its heading (`shared/section-type.ts`):
 * 16 → 20 → 24 px at 360 and 18 → 24 → 32 px from `small`, every step ≥ 1.15× (QR-TYPE-SCALE), so a header
 * above the row adds no size that falls between the row's own.
 */
const titleClass = "text-balance text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl"

/**
 * `columns/multicolumn` (t-2026-10-12-33, R1 build list item 3): two to six columns, each a picture or
 * an icon, a title, a text and an optional link, measured against Shopify's `multicolumn` (Sense, Dawn).
 *
 * - `icons`: a small icon in a round wrapper above a short title, the trust row of a Russian shop:
 *   delivery, payment, returns, a guarantee. A picture given instead (a payment mark of the shop's own)
 *   takes the icon's place, whole.
 * - `cards`: the shop's picture in the template's photo ratio (`--layer-photo-aspect`) above the text. An
 *   icon given instead stands where the icons mode puts it. A picture the shop does not have
 *   (`resolveImageRef` answers null) leaves no frame: the card keeps its words.
 * - `columns` from 1024px, never more than the items shown; `mobile` under 512px: one, two, or a row
 *   that swipes. `align` left or centre; `tone: muted` puts every column on a `--muted` card.
 *
 * An item with no title in the visitor's language, nor in English, nor in any other, is skipped; with
 * none left the block draws nothing. Colours, radius and the row's rhythm come from the theme and the
 * template's layers only.
 */
export default async function Multicolumn({ header, items, mode, columns, mobile, align, tone }: MulticolumnProps) {
  const locale = await getLocale()

  const titled = items.flatMap((item, key) => {
    const title = pickText(item.title, locale)
    return title ? [{ key, item, title }] : []
  })
  if (!titled.length) {
    return null
  }

  const shown: Shown[] = await Promise.all(
    titled.map(async ({ key, item, title }) => {
      const label = item.link ? pickText(item.link.label, locale) : null
      return {
        key,
        title,
        text: pickText(item.text, locale),
        link: item.link && label ? { href: item.link.href, label } : null,
        icon: item.icon,
        picture: item.image ? await resolveImageRef(item.image, locale) : null,
      }
    })
  )

  const count = Math.min(columns, shown.length)
  const centre = align === "center"
  const muted = tone === "muted"
  const swipe = mobile === "swipe"
  const sizes = sizesFor(count, mobile)

  return (
    <BlockSection block="columns/multicolumn" locale={locale} header={header}>
      <ul
        className={clx(
          PHONE[mobile],
          TABLET[tabletColumns(count)],
          DESKTOP[count],
          "gap-x-4 gap-y-[var(--layer-space-8,2rem)] small:gap-x-6"
        )}
      >
        {shown.map((column) => {
          const card = mode === "cards" && column.picture
          return (
            <li
              key={column.key}
              data-role="feature-card"
              className={clx(
                "flex min-w-0 flex-col",
                swipe && clx("shrink-0 snap-start xsmall:w-auto", mode === "cards" ? "w-4/5" : "w-3/5"),
                centre && "text-center",
                muted && "overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]"
              )}
            >
              {card ? (
                <div
                  data-role="card-image"
                  className={clx(
                    "relative aspect-[var(--layer-photo-aspect,1/1)] w-full overflow-hidden bg-[var(--muted)]",
                    !muted && "rounded-[var(--radius)]"
                  )}
                >
                  <Image src={column.picture!.url} alt={column.picture!.alt} fill sizes={sizes} className="object-cover" />
                </div>
              ) : null}
              <div
                className={clx(
                  "flex flex-1 flex-col gap-2",
                  centre && "items-center",
                  muted ? "p-4 small:p-6" : card && "pt-4"
                )}
              >
                {!card && (column.picture || column.icon) ? (
                  <span
                    data-role="icon-wrapper"
                    className={clx(
                      "relative mb-2 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-ui-fg-base",
                      muted ? "bg-[var(--background)]" : "bg-[var(--muted)]"
                    )}
                  >
                    {column.picture ? (
                      <Image src={column.picture.url} alt={column.picture.alt} fill sizes="48px" className="object-contain p-2" />
                    ) : (
                      <span data-role="icon" className="flex">
                        <BlockIcon name={column.icon!} className="size-6" />
                      </span>
                    )}
                  </span>
                ) : null}
                <h3 data-role="card-title" className={titleClass}>
                  {column.title}
                </h3>
                {column.text ? (
                  <p data-role="description" className={SECTION_TYPE.description}>
                    {column.text}
                  </p>
                ) : null}
                {column.link ? (
                  column.link.href.startsWith("/") ? (
                    <Link href={column.link.href} data-role="cta-secondary" className={linkClass}>
                      {column.link.label}
                    </Link>
                  ) : (
                    <a data-role="cta-secondary" href={column.link.href} className={linkClass}>
                      {column.link.label}
                    </a>
                  )
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </BlockSection>
  )
}
