import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef, type BlockImage } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import type { PromoGridProps } from "./props"

/** A tile's share of the grid: of six columns from 1024 px (`small`), of two from 512 px (`xsmall`). */
export type TileSpan = { small: 2 | 3 | 4 | 6; xsmall: 1 | 2 }

/** Equal rows of six columns: one tile across, rows of two or three, never a hole at the end. */
const EQUAL_ROWS: Record<number, TileSpan["small"][]> = {
  0: [],
  1: [6],
  2: [3, 3],
  3: [2, 2, 2],
  4: [3, 3, 3, 3],
  5: [3, 3, 2, 2, 2],
  6: [2, 2, 2, 2, 2, 2],
}

/** Two columns from 512 px: an odd last tile goes across. */
const pairs = (count: number): TileSpan["xsmall"][] =>
  Array.from({ length: count }, (_, index) => (count % 2 === 1 && index === count - 1 ? 2 : 1))

/**
 * Where each of `count` tiles stands. `equal`: the rows of `EQUAL_ROWS`. `feature`: from 1024 px the first
 * tile takes two thirds of the first row and the second one third, the rest stand in equal rows; from 512 px
 * the first goes across. Below 512 px every tile is one column.
 */
export function tileSpans(count: number, layout: PromoGridProps["layout"]): TileSpan[] {
  if (layout === "equal" || count < 2) {
    const xsmall = pairs(count)
    return EQUAL_ROWS[count].map((small, index) => ({ small, xsmall: xsmall[index] }))
  }
  const rest = pairs(count - 1)
  return [4, 2, ...EQUAL_ROWS[count - 2]].map((small, index) => ({
    small: small as TileSpan["small"],
    xsmall: index === 0 ? 2 : rest[index - 1],
  }))
}

const SMALL_SPAN = {
  2: "small:col-span-2",
  3: "small:col-span-3",
  4: "small:col-span-4",
  6: "small:col-span-6",
} as const

const XSMALL_SPAN = { 1: "xsmall:col-span-1", 2: "xsmall:col-span-2" } as const

/** The picture's share of the viewport at each width, for `next/image`. */
const sizesOf = ({ small, xsmall }: TileSpan) =>
  `(min-width: 1024px) ${Math.round((small / 6) * 100)}vw, (min-width: 512px) ${xsmall * 50}vw, 100vw`

/**
 * Between tiles. Words under the picture need more room between rows, or a button reads as the caption of
 * the picture below it.
 */
const GAP = {
  overlay: { tight: "gap-2", normal: "gap-4 small:gap-6" },
  below: { tight: "gap-x-2 gap-y-6", normal: "gap-x-4 gap-y-8 small:gap-x-6" },
} as const

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON = clx(
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  focusRing
)

/** The promotion in a word or two on the picture's corner, a pill in the template's accent. */
const BADGE =
  "absolute left-3 top-3 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium tabular-nums text-[var(--primary-foreground)] small:left-4 small:top-4"

type ShownTile = {
  picture: BlockImage
  badge: string | null
  heading: string
  text: string | null
  button: { label: string; href: string } | null
}

function Words({ tile }: { tile: ShownTile }) {
  return (
    <>
      {/* It grows, so the buttons of a row of tiles stand on one line under words of different lengths. */}
      <div className="flex flex-1 flex-col items-start gap-2">
        <h3 data-role="headline" className="text-balance text-xl font-semibold leading-tight text-ui-fg-base small:text-2xl">
          {tile.heading}
        </h3>
        {tile.text ? (
          <p data-role="description" className={SECTION_TYPE.description}>
            {tile.text}
          </p>
        ) : null}
      </div>
      {tile.button ? (
        <div className="pt-2">
          {tile.button.href.startsWith("/") ? (
            <Link href={tile.button.href} data-role="cta-primary" className={BUTTON}>
              {tile.button.label}
            </Link>
          ) : (
            <a data-role="cta-primary" href={tile.button.href} className={BUTTON}>
              {tile.button.label}
            </a>
          )}
        </div>
      ) : null}
    </>
  )
}

/**
 * `promo/grid` (t-2026-10-12-33, R1 build list item 13): the shop's promotions as tiles, two to six, each a
 * picture with a badge such as «−20 %», a heading, a line of text and a button. Measured against Impulse's
 * promo grid (the `promo-grid` row of the Shopify catalogue: tiles of a half and a quarter of the row, words
 * centred on a darkened picture); our own tokens throughout.
 *
 * - `equal` lays the tiles in rows of two or three from 1024 px (four as 2 × 2, five as 2 + 3); `feature`
 *   gives the first tile two thirds of the first row. From 512 px two columns, below it one (`tileSpans`).
 * - `overlay`: the picture fills the tile and the words stand on a solid `--background` panel at its foot,
 *   the palette's own text colours on its own background, so they read on a light and a dark template alike
 *   and over any picture, with no black scrim. The tile is at least 24 rem high and keeps 9 rem of picture
 *   above the panel, both times `--layer-density`; it grows with the words. `below`: the picture in a box
 *   of 14 rem, 18 rem from 1024 px, and the words under it on the page. A row of tiles of two widths keeps
 *   one height either way, so a height, not the template's photo ratio, sets the box.
 * - The badge is a pill in `--primary` on the picture's corner; the button wears the template's button layer.
 *
 * A tile without a heading is dropped and its picture never read; so is a tile whose picture the shop does
 * not have. With none left the block draws nothing. The tile headings are `h3`: the block has no section
 * title of its own, and the page's sections keep theirs (QR-HEADING-RANK).
 */
export default async function PromoGrid({ tiles, layout, textPosition, gap }: PromoGridProps) {
  const locale = await getLocale()
  const worded = tiles.flatMap((tile) => {
    const heading = pickText(tile.heading, locale)
    return heading ? [{ tile, heading }] : []
  })
  if (worded.length === 0) {
    return null
  }

  const pictures = await Promise.all(worded.map(({ tile }) => resolveImageRef(tile.image, locale)))
  const shown: ShownTile[] = worded.flatMap(({ tile, heading }, index) => {
    const picture = pictures[index]
    if (!picture) return []
    const label = tile.button ? pickText(tile.button.label, locale) : null
    return [
      {
        picture,
        badge: pickText(tile.badge, locale),
        heading,
        text: pickText(tile.text, locale),
        button: tile.button && label ? { label, href: tile.button.href } : null,
      },
    ]
  })
  if (shown.length === 0) {
    return null
  }

  const spans = tileSpans(shown.length, layout)
  const overlay = textPosition === "overlay"

  return (
    <BlockSection block="promo/grid" locale={locale}>
      <ul className={clx("grid grid-cols-1 xsmall:grid-cols-2 small:grid-cols-6", GAP[textPosition][gap])}>
        {shown.map((tile, index) => {
          const span = spans[index]
          const badge = tile.badge ? (
            <span data-role="badge" className={BADGE}>
              {tile.badge}
            </span>
          ) : null
          const picture = (
            <Image src={tile.picture.url} alt={tile.picture.alt} fill sizes={sizesOf(span)} className="object-cover" />
          )
          return (
            <li
              key={index}
              data-role="card"
              className={clx(
                XSMALL_SPAN[span.xsmall],
                SMALL_SPAN[span.small],
                overlay
                  ? "relative flex min-h-[calc(24rem*var(--layer-density,1))] flex-col overflow-hidden rounded-[var(--radius)] bg-[var(--muted)] p-3 small:p-4"
                  : "flex flex-col"
              )}
            >
              {overlay ? (
                <>
                  <div data-role="card-image" className="absolute inset-0">
                    {picture}
                  </div>
                  {badge}
                  {/* The picture's own room above the panel, the badge in it: the panel never covers the whole picture. */}
                  <div aria-hidden="true" className="min-h-[calc(9rem*var(--layer-density,1))] flex-1" />
                  <div className="relative flex max-w-md flex-col items-start gap-2 rounded-[var(--radius)] bg-[var(--background)] p-4 small:p-6">
                    <Words tile={tile} />
                  </div>
                </>
              ) : (
                <>
                  <div
                    data-role="card-image"
                    className="relative h-[calc(14rem*var(--layer-density,1))] overflow-hidden rounded-[var(--radius)] bg-[var(--muted)] small:h-[calc(18rem*var(--layer-density,1))]"
                  >
                    {picture}
                    {badge}
                  </div>
                  <div className="flex flex-1 flex-col items-start gap-2 pt-4">
                    <Words tile={tile} />
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </BlockSection>
  )
}
