import { clx } from "@medusajs/ui"
import Image from "next/image"

import ProductMediaBackdrop from "./backdrop"
import HoverImage from "./hover-image"
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
 *    the frame's own radius. What is left of the frame around a picture of another ratio
 *    continues that picture's own EDGE (`./backdrop`): a strip beside a white packshot is
 *    white and a strip beside a full-bleed infographic repeats the colours the infographic
 *    ends with. A uniform 3% veil over the whole frame gives every tile the same edge
 *    against the page, so mixed photos read as one grid.
 * 3. A product without photos keeps the same frame and shows a designed placeholder in
 *    it. A missing photo never changes a card's height.
 *
 * `cover` stays available to imagery an owner chose as decoration (hero, category tiles,
 * journal covers). Those do not come through this component.
 */
export type ProductMediaContext = "card" | "gallery" | "line"

/**
 * Cards and the gallery are 3:4, the marketplace standard: 479 of the 483 files of the
 * reference shop are 3:4, so almost every photo fills its frame with no letterbox at all.
 * A theme may override the ratio with `--product-media-ratio`; 3 / 4 is the platform
 * default. Cart and order lines are square, because a line is a row of text with a small
 * mark next to it, not a showcase.
 */
export const FRAME_ASPECT: Record<ProductMediaContext, string> = {
  card: "var(--product-media-ratio, 3 / 4)",
  gallery: "var(--product-media-ratio, 3 / 4)",
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
  /** Shown while a mouse is over the frame; fetched on the first hover. Cards only. */
  secondSrc?: string | null
  priority?: boolean
  /** Overrides `FRAME_SIZES[context]` when the slot is not the context's usual one. */
  sizes?: string
  quality?: number
  /**
   * The product page's gallery card: the picture on the card's own base colour with no
   * veil (the photo IS the card's content, not a tile in a grid). Cards keep the veil.
   */
  flat?: boolean
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
  flat = false,
  className,
  "data-testid": dataTestid,
}: ProductMediaProps) {
  const slot = sizes ?? FRAME_SIZES[context]
  const showSecond =
    context === "card" &&
    Boolean(src) &&
    Boolean(secondSrc) &&
    secondSrc !== src

  return (
    <div
      className={clx(
        "product-media group/media relative block overflow-hidden",
        flat ? "bg-ui-bg-base" : "bg-ui-bg-subtle",
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
          <ProductMediaBackdrop src={src} />
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            quality={quality}
            sizes={slot}
            draggable={false}
            className="object-contain object-center"
          />
          {showSecond ? (
            <HoverImage
              src={secondSrc as string}
              sizes={slot}
              quality={quality}
            />
          ) : null}
        </>
      ) : (
        <ProductMediaPlaceholder compact={context === "line"} />
      )}
      {!flat && (
        <span
          aria-hidden
          // An edge-darkening overlay in the page ink at 3%: dark on a light page, light on a dark
          // one. The alpha lives inside color-mix(), because Tailwind drops an opacity modifier on a
          // bare var() colour (AGENTS.md, «An opacity modifier on a bare var() colour»).
          className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)]"
        />
      )}
    </div>
  )
}
