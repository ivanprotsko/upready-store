import { clx } from "@medusajs/ui"
import { ArrowRight } from "lucide-react"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import ProductCard from "@modules/products/components/product-card"

import BlockSection from "../../shared/block-section"
import type { MosaicProps } from "./props"
import { resolveMosaicTiles, type ResolvedTile } from "./tiles"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"

/**
 * The list: a grid of two on a phone (`stack`) or a row that scrolls (`swipe`), and from 720 px
 * the mosaic's columns. The block's own pictures follow the template's photo layer; a product
 * tile is the storefront's card with the frame it has in every grid of the shop, since a photo
 * of another ratio would be letterboxed in it (`ProductMedia` never crops).
 *
 * The row that scrolls fades out over its last 1.5rem, so the next tile's cut edge reads as «more
 * this way»; the row ends in 1.5rem of padding, so the last tile is whole once scrolled to.
 */
const LIST: Record<MosaicProps["mobile"], string> = {
  stack: "grid grid-cols-2 gap-x-3",
  swipe: clx(
    "flex snap-x snap-mandatory gap-x-3 overflow-x-auto pb-2 pe-6",
    "[mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,black_calc(100%_-_1.5rem),transparent)]",
    "min-[720px]:grid min-[720px]:overflow-visible min-[720px]:pb-0 min-[720px]:pe-0 min-[720px]:[mask-image:none] min-[720px]:rtl:[mask-image:none]"
  ),
}

/**
 * The mosaic's shape follows the tiles that resolved: three are one large and two small, five one
 * large and four small, and any other count stands equal.
 */
type Shape = "three" | "five" | "equal"

/** Two or four equal tiles, the large one on two rows beside a column of two, or on two of four columns beside two by two. */
const COLUMNS = {
  equal: "min-[720px]:grid-cols-2",
  four: "min-[720px]:grid-cols-4",
  left: "min-[720px]:grid-cols-[2fr_1fr]",
  right: "min-[720px]:grid-cols-[1fr_2fr]",
} as const

/**
 * Where each tile stands from 720 px: the large one first, the small ones in the other column, or
 * two by two in the other two. A span comes before its start, as `clx` keeps the later of the two.
 */
const PLACE: Record<"three" | "five", Record<MosaicProps["largeSide"], string[]>> = {
  three: {
    left: [
      "min-[720px]:col-start-1 min-[720px]:row-span-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-2 min-[720px]:row-start-2",
    ],
    right: [
      "min-[720px]:col-start-2 min-[720px]:row-span-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-1 min-[720px]:row-start-1",
      "min-[720px]:col-start-1 min-[720px]:row-start-2",
    ],
  },
  five: {
    left: [
      "min-[720px]:col-span-2 min-[720px]:col-start-1 min-[720px]:row-span-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-3 min-[720px]:row-start-1",
      "min-[720px]:col-start-4 min-[720px]:row-start-1",
      "min-[720px]:col-start-3 min-[720px]:row-start-2",
      "min-[720px]:col-start-4 min-[720px]:row-start-2",
    ],
    right: [
      "min-[720px]:col-span-2 min-[720px]:col-start-3 min-[720px]:row-span-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-1 min-[720px]:row-start-1",
      "min-[720px]:col-start-2 min-[720px]:row-start-1",
      "min-[720px]:col-start-1 min-[720px]:row-start-2",
      "min-[720px]:col-start-2 min-[720px]:row-start-2",
    ],
  },
}

/**
 * The gaps. Five stand one step apart across and down from 720 px, so the large square is two small
 * ones and a gap, and two by two on a phone as well; the row that scrolls keeps its own step.
 */
const gapsOf = (shape: Shape, mobile: MosaicProps["mobile"]) =>
  shape === "five"
    ? clx(
        "gap-y-[var(--layer-space-6,1.5rem)] min-[720px]:gap-x-[var(--layer-space-6,1.5rem)]",
        mobile === "stack" && "gap-x-[var(--layer-space-6,1.5rem)]"
      )
    : "gap-y-[var(--layer-space-6,1.5rem)] min-[720px]:gap-x-4 small:gap-x-6"

/** The tile's share of the viewport, from 720 px and below it. */
const sizesOf = (shape: Shape, large: boolean, count: number, mobile: MosaicProps["mobile"]) => {
  const wide =
    shape === "three" ? (large ? "66vw" : "33vw") : shape === "five" ? (large ? "50vw" : "25vw") : count === 4 ? "25vw" : "50vw"
  const phone = mobile === "swipe" ? "80vw" : large ? "100vw" : "50vw"
  return `(min-width: 720px) ${wide}, ${phone}`
}

function PictureTile({ tile, sizes }: { tile: Extract<ResolvedTile, { kind: "picture" }>; sizes: string }) {
  const body = (
    <>
      <div data-role="card-image" className="relative flex-1 overflow-hidden rounded-[var(--radius)]">
        <div aria-hidden className="aspect-[var(--layer-photo-aspect,1/1)]" />
        <Image src={tile.picture.url} alt={tile.picture.alt} fill sizes={sizes} className="object-cover" />
      </div>
      {tile.title ? (
        <h3 className="mt-3 flex items-center gap-x-2 break-words text-base font-medium leading-6 text-ui-fg-base group-hover:underline group-hover:underline-offset-4">
          {tile.title}
          {tile.href ? (
            <ArrowRight
              aria-hidden
              className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100"
            />
          ) : null}
        </h3>
      ) : null}
    </>
  )
  const frame = "flex flex-1 flex-col"
  if (!tile.href) return <div className={frame}>{body}</div>
  return tile.href.startsWith("/") ? (
    <Link href={tile.href} className={clx("group rounded-[var(--radius)]", frame, focusRing)}>
      {body}
    </Link>
  ) : (
    <a href={tile.href} className={clx("group rounded-[var(--radius)]", frame, focusRing)}>
      {body}
    </a>
  )
}

/**
 * `collage/mosaic` (t-2026-10-12-33, R1 build list item 8): one large tile and two small ones,
 * the collage 9 of 18 Shopify themes carry, or one large and four small, the picture gallery of 5
 * of the 10 Tilda shop templates read. A tile is a picture of the template's choosing with a
 * caption, one of the shop's products drawn with the storefront's own card, or one of its
 * categories with the picture its owner gave it and its name; `tiles.ts` reads them through the
 * shop's loaders.
 *
 * - From 720 px the first tile stands on `largeSide`, two rows high: with three it takes two thirds
 *   of the row and the other two stand in a column beside it; with five it takes two of four
 *   columns and the other four stand two by two beside it, one gap step apart. The large tile grows
 *   to the rows' height, its picture covering the frame; every picture keeps at least the
 *   template's photo ratio.
 * - Below 720 px, `stack` puts the large tile across and the small ones two by two under it;
 *   `swipe` lines them all up in a row that scrolls, 80 % of the width each.
 * - A tile that is not there is dropped. Three that resolve take the three-tile shape, five the
 *   five-tile one, and two or four stand equal; with fewer than two the block draws nothing.
 *
 * The heading is the shell's (`BlockSection`), never a heading of its own; a tile's caption is
 * an `h3`, as the product card's title is.
 */
export default async function Mosaic({ header, tiles, largeSide, mobile }: MosaicProps) {
  if (tiles.length < 2) {
    return null
  }

  const locale = await getLocale()
  const resolved = await resolveMosaicTiles(tiles, locale)

  if (resolved.length < 2) {
    return null
  }

  const shape: Shape = resolved.length === 5 ? "five" : resolved.length === 3 ? "three" : "equal"
  const columns = shape === "three" ? largeSide : shape === "five" || resolved.length === 4 ? "four" : "equal"
  const isLarge = (index: number) => shape !== "equal" && index === 0

  return (
    <BlockSection block="collage/mosaic" locale={locale} header={header}>
      <ul className={clx(LIST[mobile], gapsOf(shape, mobile), COLUMNS[columns])}>
        {resolved.map((tile, index) => (
          <li
            key={index}
            data-role={tile.kind === "product" ? "product-card" : "card"}
            className={clx(
              "flex min-w-0 flex-col",
              mobile === "swipe"
                ? "w-[80%] shrink-0 snap-start min-[720px]:w-auto"
                : isLarge(index) && (shape === "five" ? "col-span-2" : "col-span-2 min-[720px]:col-span-1"),
              shape !== "equal" && PLACE[shape][largeSide][index]
            )}
          >
            {tile.kind === "product" ? (
              <ProductCard product={tile.product} />
            ) : (
              <PictureTile tile={tile} sizes={sizesOf(shape, isLarge(index), resolved.length, mobile)} />
            )}
          </li>
        ))}
      </ul>
    </BlockSection>
  )
}
