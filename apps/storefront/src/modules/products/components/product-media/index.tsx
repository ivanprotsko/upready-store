import { clx } from "@medusajs/ui"
import Image from "next/image"

import ProductMediaPlaceholder from "./placeholder"

/**
 * The one frame every product picture goes through: catalog and home cards, related
 * products, the product gallery, cart and order lines, search results.
 *
 * Three rules hold everywhere, which is why they live here and nowhere else.
 *
 * 1. The frame's aspect ratio is fixed per context and chosen once, in `FRAME_ASPECT`
 *    below. A shop's photos never decide the height of a card, so a grid row is even
 *    whatever the owner uploaded.
 * 2. Product media is never cropped. The picture is `object-fit: contain`, centred, with
 *    no inner padding: a picture whose ratio equals the frame fills it edge to edge under
 *    the frame's own radius. What is left of the frame around any other picture is filled
 *    by a blurred copy of the same picture, so the letterbox of a white packshot is white,
 *    that of a tinted photo is tinted and that of a full-bleed marketplace infographic
 *    continues its own edge. On a flat surface the same three looked like stickers with
 *    stripes beside them (measured on the reference shop: 3:4 photos in the 4:5 frame
 *    leave a 3% strip on each side). A uniform 3% veil over the whole frame then gives
 *    every tile the same edge against the page, so mixed photos read as one grid.
 *    The backdrop is a 64px file and decoration only (`data-product-media-backdrop`).
 * 3. A product without photos keeps the same frame and shows a designed placeholder in
 *    it. A missing photo never changes a card's height.
 *
 * `cover` stays available to imagery an owner chose as decoration (hero, category tiles,
 * journal covers). Those do not come through this component.
 */
export type ProductMediaContext = "card" | "gallery" | "line"

/**
 * Cards are 4:5. The gallery is 4:5 as well, on the phone and on the desktop: the
 * marketplace photos this storefront was measured against are 3:4 (479 of 483 files of
 * the reference shop), and a 3:4 picture covers 94% of a 4:5 frame's width but only 75%
 * of a 1:1 frame's. Cart and order lines are square, because a line is a row of text
 * with a small mark next to it, not a showcase.
 */
export const FRAME_ASPECT: Record<ProductMediaContext, string> = {
  card: "4 / 5",
  gallery: "4 / 5",
  line: "1 / 1",
}

/** What the browser should fetch per context, so a card never downloads a gallery file. */
export const FRAME_SIZES: Record<ProductMediaContext, string> = {
  card: "(max-width: 1023px) 50vw, (max-width: 1439px) 33vw, 25vw",
  gallery: "(max-width: 1023px) 100vw, 50vw",
  line: "96px",
}

type ProductMediaProps = {
  src?: string | null
  alt: string
  context?: ProductMediaContext
  /** Cross-faded in on hover, on devices that hover. Cards only. */
  secondSrc?: string | null
  priority?: boolean
  /** Overrides `FRAME_SIZES[context]` when the slot is not the context's usual one. */
  sizes?: string
  quality?: number
  className?: string
  "data-testid"?: string
}

export default function ProductMedia({
  src,
  alt,
  context = "card",
  secondSrc,
  priority,
  sizes,
  quality = 70,
  className,
  "data-testid": dataTestid,
}: ProductMediaProps) {
  const slot = sizes ?? FRAME_SIZES[context]
  const showSecond = context === "card" && Boolean(src) && Boolean(secondSrc) && secondSrc !== src

  return (
    <div
      className={clx(
        "product-media group/media relative block overflow-hidden bg-ui-bg-subtle",
        // Full width of its slot unless the caller sizes it.
        !/(^|\s)w-/.test(className ?? "") && "w-full",
        context === "line" ? "rounded-md" : "rounded-[var(--radius,8px)]",
        className
      )}
      style={{ aspectRatio: FRAME_ASPECT[context] }}
      data-product-media={context}
      data-product-media-state={src ? "photo" : "placeholder"}
      data-testid={dataTestid}
    >
      {src ? (
        <>
          <Image
            src={src}
            alt=""
            aria-hidden
            fill
            quality={30}
            sizes="64px"
            draggable={false}
            data-product-media-backdrop=""
            className="scale-125 object-cover object-center blur-2xl"
          />
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            quality={quality}
            sizes={slot}
            draggable={false}
            className={clx(
              "object-contain object-center",
              showSecond &&
                "transition-opacity duration-200 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/media:opacity-0"
            )}
          />
          {showSecond ? (
            <Image
              src={secondSrc as string}
              alt=""
              aria-hidden
              fill
              quality={quality}
              sizes={slot}
              draggable={false}
              className="object-contain object-center opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/media:opacity-100"
            />
          ) : null}
        </>
      ) : (
        <ProductMediaPlaceholder compact={context === "line"} />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-black/[0.03] dark:bg-white/[0.04]" />
    </div>
  )
}
