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

/** Two equal tiles, or the large one on two rows beside a column of two. */
const COLUMNS = {
  equal: "min-[720px]:grid-cols-2",
  left: "min-[720px]:grid-cols-[2fr_1fr]",
  right: "min-[720px]:grid-cols-[1fr_2fr]",
} as const

/** Where each of three tiles stands from 720 px: the large one first, the small ones in the other column. */
const PLACE: Record<MosaicProps["largeSide"], [string, string, string]> = {
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
}

/** The tile's share of the viewport, from 720 px and below it. */
const sizesOf = (share: "large" | "small" | "equal", mobile: MosaicProps["mobile"]) => {
  const wide = { large: "66vw", small: "33vw", equal: "50vw" }[share]
  const phone = mobile === "swipe" ? "80vw" : share === "large" ? "100vw" : "50vw"
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
 * the collage 9 of 18 Shopify themes carry. A tile is a picture of the template's choosing with
 * a caption, one of the shop's products drawn with the storefront's own card, or one of its
 * categories with the picture its owner gave it and its name; `tiles.ts` reads them through the
 * shop's loaders.
 *
 * - From 720 px the first tile takes two thirds of the row on `largeSide`, two rows high, and the
 *   other two stand in a column beside it. The large tile grows to the column's height, its
 *   picture covering the frame; every picture keeps at least the template's photo ratio.
 * - Below 720 px, `stack` puts the large tile across and the two small ones side by side under
 *   it; `swipe` lines the three up in a row that scrolls, 80 % of the width each.
 * - A tile that is not there is dropped and the other two stand equal; with fewer than two the
 *   block draws nothing.
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

  const shaped = resolved.length === 3
  const shareOf = (index: number) => (!shaped ? "equal" : index === 0 ? "large" : "small")

  return (
    <BlockSection block="collage/mosaic" locale={locale} header={header}>
      <ul
        className={clx(
          LIST[mobile],
          "gap-y-[var(--layer-space-6,1.5rem)] min-[720px]:gap-x-4 small:gap-x-6",
          COLUMNS[shaped ? largeSide : "equal"]
        )}
      >
        {resolved.map((tile, index) => (
          <li
            key={index}
            data-role={tile.kind === "product" ? "product-card" : "card"}
            className={clx(
              "flex min-w-0 flex-col",
              mobile === "swipe" ? "w-[80%] shrink-0 snap-start min-[720px]:w-auto" : shareOf(index) === "large" && "col-span-2 min-[720px]:col-span-1",
              shaped && PLACE[largeSide][index]
            )}
          >
            {tile.kind === "product" ? (
              <ProductCard product={tile.product} />
            ) : (
              <PictureTile tile={tile} sizes={sizesOf(shareOf(index), mobile)} />
            )}
          </li>
        ))}
      </ul>
    </BlockSection>
  )
}
